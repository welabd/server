const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();


function computeStatus(paidAmount, totalAmount) {
  if (paidAmount <= 0) return 'Non Payé';
  if (paidAmount >= totalAmount) return 'Payé';
  return 'Partiellement Payé';
}

// Get all credits
router.get('/', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;

    const where = {};
    if (search) where.clientName = { contains: search };
    if (status) where.status = status;

    const total = await prisma.credit.count({ where });
    const credits = await prisma.credit.findMany({
      where,
      include: { payments: { orderBy: { date: 'desc' } } },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    const allCredits = await prisma.credit.findMany();
    const totalAmount = allCredits.reduce((s, c) => s + c.totalAmount, 0);
    const totalPaid = allCredits.reduce((s, c) => s + c.paidAmount, 0);
    const totalRemaining = totalAmount - totalPaid;
    const fullyPaid = allCredits.filter(c => c.status === 'Payé').length;
    const partial = allCredits.filter(c => c.status === 'Partiellement Payé').length;
    const unpaid = allCredits.filter(c => c.status === 'Non Payé').length;

    res.json({
      credits,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      stats: { totalAmount, totalPaid, totalRemaining, count: allCredits.length, fullyPaid, partial, unpaid },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des crédits' });
  }
});

// Get single credit
router.get('/:id', async (req, res) => {
  try {
    const credit = await prisma.credit.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { payments: { orderBy: { date: 'desc' } } },
    });
    if (!credit) return res.status(404).json({ error: 'Crédit non trouvé' });
    res.json(credit);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create credit
router.post('/',
  [
    body('clientName').notEmpty().withMessage('Nom client requis'),
    body('totalAmount').isFloat({ min: 0 }).withMessage('Montant total invalide'),
    body('date').isISO8601().withMessage('Date invalide'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { clientName, totalAmount, date, notes } = req.body;
      const total = parseFloat(totalAmount);
      const credit = await prisma.credit.create({
        data: {
          clientName,
          totalAmount: total,
          paidAmount: 0,
          date: new Date(date),
          notes,
          status: 'Non Payé',
        },
        include: { payments: true },
      });
      res.status(201).json(credit);
    } catch (error) {
      res.status(500).json({ error: 'Erreur lors de la création du crédit' });
    }
  }
);

// Update credit
router.put('/:id', async (req, res) => {
  try {
    const { clientName, totalAmount, date, notes } = req.body;
    const existing = await prisma.credit.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!existing) return res.status(404).json({ error: 'Crédit non trouvé' });

    const data = {};
    if (clientName !== undefined) data.clientName = clientName;
    if (date !== undefined) data.date = new Date(date);
    if (notes !== undefined) data.notes = notes;
    if (totalAmount !== undefined) {
      const newTotal = parseFloat(totalAmount);
      data.totalAmount = newTotal;
      data.status = computeStatus(existing.paidAmount, newTotal);
    }

    const credit = await prisma.credit.update({
      where: { id: parseInt(req.params.id) },
      data,
      include: { payments: { orderBy: { date: 'desc' } } },
    });
    res.json(credit);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Crédit non trouvé' });
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// Delete credit
router.delete('/:id', async (req, res) => {
  try {
    await prisma.credit.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Crédit supprimé avec succès' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Crédit non trouvé' });
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// Add payment to credit
router.post('/:id/payments',
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Montant invalide'),
    body('date').isISO8601().withMessage('Date invalide'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const creditId = parseInt(req.params.id);
      const credit = await prisma.credit.findUnique({ where: { id: creditId } });
      if (!credit) return res.status(404).json({ error: 'Crédit non trouvé' });

      const payAmount = parseFloat(req.body.amount);
      const remaining = credit.totalAmount - credit.paidAmount;
      if (payAmount > remaining) {
        return res.status(400).json({ error: `Le montant dépasse le solde restant (${remaining})` });
      }

      const newPaid = credit.paidAmount + payAmount;
      const newStatus = computeStatus(newPaid, credit.totalAmount);

      await prisma.payment.create({
        data: { creditId, amount: payAmount, date: new Date(req.body.date), notes: req.body.notes },
      });

      const updated = await prisma.credit.update({
        where: { id: creditId },
        data: { paidAmount: newPaid, status: newStatus },
        include: { payments: { orderBy: { date: 'desc' } } },
      });

      res.status(201).json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Erreur lors du paiement' });
    }
  }
);

// Delete payment
router.delete('/:id/payments/:paymentId', async (req, res) => {
  try {
    const creditId = parseInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return res.status(404).json({ error: 'Paiement non trouvé' });

    const credit = await prisma.credit.findUnique({ where: { id: creditId } });
    const newPaid = Math.max(0, credit.paidAmount - payment.amount);
    const newStatus = computeStatus(newPaid, credit.totalAmount);

    await prisma.payment.delete({ where: { id: paymentId } });
    const updated = await prisma.credit.update({
      where: { id: creditId },
      data: { paidAmount: newPaid, status: newStatus },
      include: { payments: { orderBy: { date: 'desc' } } },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression du paiement' });
  }
});

module.exports = router;
