const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Get all recettes
router.get('/', async (req, res) => {
  try {
    const { search, month, year, page = 1, limit = 20 } = req.query;

    const where = {};
    if (month && year) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    } else if (year) {
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year), 11, 31, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    }

    const total = await prisma.recette.count({ where });
    const recettes = await prisma.recette.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const currentMonthRecettes = await prisma.recette.findMany({ where: { date: { gte: currentMonthStart, lte: currentMonthEnd } } });
    const prevMonthRecettes = await prisma.recette.findMany({ where: { date: { gte: prevMonthStart, lte: prevMonthEnd } } });

    const currentMonthTotal = currentMonthRecettes.reduce((s, r) => s + r.amount, 0);
    const prevMonthTotal = prevMonthRecettes.reduce((s, r) => s + r.amount, 0);
    const allTotal = (await prisma.recette.aggregate({ _sum: { amount: true } }))._sum.amount || 0;

    res.json({
      recettes,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      stats: { total: allTotal, currentMonth: currentMonthTotal, prevMonth: prevMonthTotal },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des recettes' });
  }
});

// Get single recette
router.get('/:id', async (req, res) => {
  try {
    const recette = await prisma.recette.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!recette) return res.status(404).json({ error: 'Recette non trouvée' });
    res.json(recette);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create recette
router.post('/',
  [
    body('amount').isFloat({ min: 0 }).withMessage('Montant invalide'),
    body('date').isISO8601().withMessage('Date invalide'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { date, amount, notes } = req.body;
      const recette = await prisma.recette.create({
        data: { date: new Date(date), amount: parseFloat(amount), notes: notes || null },
      });
      res.status(201).json(recette);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erreur lors de la création' });
    }
  }
);

// Update recette
router.put('/:id', async (req, res) => {
  try {
    const { date, amount, notes } = req.body;
    const data = {};
    if (date !== undefined) data.date = new Date(date);
    if (amount !== undefined) data.amount = parseFloat(amount);
    if (notes !== undefined) data.notes = notes;

    const recette = await prisma.recette.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json(recette);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Recette non trouvée' });
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// Delete recette
router.delete('/:id', async (req, res) => {
  try {
    await prisma.recette.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Recette supprimée avec succès' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Recette non trouvée' });
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;