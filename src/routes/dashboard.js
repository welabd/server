const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();


router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Recettes
    const recetteStats = await prisma.recette.aggregate({ _sum: { amount: true }, _count: true });
    const currentMonthRecettes = await prisma.recette.aggregate({
      where: { date: { gte: currentMonthStart, lte: currentMonthEnd } },
      _sum: { amount: true },
    });
    const prevMonthRecettes = await prisma.recette.aggregate({
      where: { date: { gte: prevMonthStart, lte: prevMonthEnd } },
      _sum: { amount: true },
    });

    // Cheques
    const allCheques = await prisma.cheque.findMany();
    const totalCheques = allCheques.reduce((s, c) => s + c.amount, 0);
    const totalPaidCheques = allCheques.filter(c => c.status === 'Payé').reduce((s, c) => s + c.amount, 0);
    const totalUnpaidCheques = allCheques.filter(c => c.status === 'Non Payé').reduce((s, c) => s + c.amount, 0);

    // Credits
    const allCredits = await prisma.credit.findMany();
    const totalCredits = allCredits.reduce((s, c) => s + c.totalAmount, 0);
    const totalPaidCredits = allCredits.reduce((s, c) => s + c.paidAmount, 0);
    const totalRemainingCredits = totalCredits - totalPaidCredits;

    // Clients (unique)
    const chequeClients = await prisma.cheque.findMany({ select: { clientName: true }, distinct: ['clientName'] });
    const creditClients = await prisma.credit.findMany({ select: { clientName: true }, distinct: ['clientName'] });
    const allClientNames = new Set([...chequeClients.map(c => c.clientName), ...creditClients.map(c => c.clientName)]);

    // Monthly chart (last 6 months)
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const [rec, chq] = await Promise.all([
        prisma.recette.aggregate({ where: { date: { gte: mStart, lte: mEnd } }, _sum: { amount: true } }),
        prisma.cheque.aggregate({ where: { date: { gte: mStart, lte: mEnd }, status: 'Payé' }, _sum: { amount: true } }),
      ]);
      monthlyData.push({
        month: mStart.toLocaleString('fr-FR', { month: 'short' }),
        recettes: rec._sum.amount || 0,
        cheques: chq._sum.amount || 0,
      });
    }

    res.json({
      recettes: {
        total: recetteStats._sum.amount || 0,
        currentMonth: currentMonthRecettes._sum.amount || 0,
        prevMonth: prevMonthRecettes._sum.amount || 0,
        count: recetteStats._count,
      },
      cheques: {
        total: totalCheques,
        paid: totalPaidCheques,
        unpaid: totalUnpaidCheques,
        count: allCheques.length,
        paidCount: allCheques.filter(c => c.status === 'Payé').length,
        unpaidCount: allCheques.filter(c => c.status === 'Non Payé').length,
      },
      credits: {
        total: totalCredits,
        paid: totalPaidCredits,
        remaining: totalRemainingCredits,
        count: allCredits.length,
        fullyPaid: allCredits.filter(c => c.status === 'Payé').length,
        partial: allCredits.filter(c => c.status === 'Partiellement Payé').length,
        unpaid: allCredits.filter(c => c.status === 'Non Payé').length,
      },
      clients: { total: allClientNames.size },
      monthlyChart: monthlyData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

module.exports = router;
