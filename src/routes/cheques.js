const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (search) {
      where.OR = [
        { numero: { contains: search } },
        { clientName: { contains: search } },
      ];
    }
    if (status) where.status = status;

    const total = await prisma.cheque.count({ where });
    const cheques = await prisma.cheque.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    const allCheques = await prisma.cheque.findMany({});
    const totalPaid = allCheques.filter(c => c.status === 'Payé').reduce((s, c) => s + c.amount, 0);
    const totalUnpaid = allCheques.filter(c => c.status === 'Non Payé').reduce((s, c) => s + c.amount, 0);

    res.json({
      cheques,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      stats: { totalPaid, totalUnpaid, count: allCheques.length },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des chèques' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const cheque = await prisma.cheque.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!cheque) return res.status(404).json({ error: 'Chèque non trouvé' });
    res.json(cheque);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/',
  [
    body('numero').notEmpty().withMessage('Numéro requis'),
    body('clientName').notEmpty().withMessage('Nom client requis'),
    body('amount').isFloat({ min: 0 }).withMessage('Montant invalide'),
    body('date').isISO8601().withMessage('Date invalide'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { numero, clientName, amount, date, dueDate, type = 'Reçu', status = 'Non Payé', notes } = req.body;
      const cheque = await prisma.cheque.create({
        data: {
          numero, clientName,
          amount: parseFloat(amount),
          date: new Date(date),
          dueDate: dueDate ? new Date(dueDate) : null,
          type,
          status,
          notes: notes || null,
        },
      });
      res.status(201).json(cheque);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erreur lors de la création du chèque' });
    }
  }
);

router.put('/:id', async (req, res) => {
  try {
    const { numero, clientName, amount, date, dueDate, type, status, notes } = req.body;
    const data = {};
    if (numero !== undefined) data.numero = numero;
    if (clientName !== undefined) data.clientName = clientName;
    if (amount !== undefined) data.amount = parseFloat(amount);
    if (date !== undefined) data.date = new Date(date);
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (type !== undefined) data.type = type;
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes;

    const cheque = await prisma.cheque.update({ where: { id: parseInt(req.params.id) }, data });
    res.json(cheque);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Chèque non trouvé' });
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.cheque.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Chèque supprimé avec succès' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Chèque non trouvé' });
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;