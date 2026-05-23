const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@gestionfinance.com' },
    update: {},
    create: {
      email: 'admin@gestionfinance.com',
      password: hashedPassword,
      name: 'Administrateur',
      role: 'admin',
    },
  });

  // Create default settings
  const defaultSettings = [
    { key: 'businessName', value: 'Gestion Finance' },
    { key: 'logoUrl', value: '' },
    { key: 'themeColor', value: '#6366f1' },
    { key: 'currency', value: 'MAD' },
  ];

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  // Sample Cheques
  const cheques = [
    { numero: 'CHQ-001', clientName: 'Ahmed Benali', amount: 15000, date: new Date('2024-01-15'), status: 'Payé' },
    { numero: 'CHQ-002', clientName: 'Fatima Zahra', amount: 8500, date: new Date('2024-02-10'), status: 'Non Payé' },
    { numero: 'CHQ-003', clientName: 'Karim Mansouri', amount: 22000, date: new Date('2024-02-20'), status: 'Payé' },
    { numero: 'CHQ-004', clientName: 'Sara Alaoui', amount: 5000, date: new Date('2024-03-05'), status: 'Non Payé' },
    { numero: 'CHQ-005', clientName: 'Hassan Idrissi', amount: 12000, date: new Date('2024-03-12'), status: 'Payé' },
  ];

  for (const cheque of cheques) {
    await prisma.cheque.create({ data: cheque });
  }

  // Sample Recettes
  const recettes = [
    { date: new Date('2024-01-05'), description: 'Vente produits A', amount: 45000 },
    { date: new Date('2024-01-18'), description: 'Prestation service B', amount: 28000 },
    { date: new Date('2024-02-08'), description: 'Vente produits C', amount: 62000 },
    { date: new Date('2024-02-22'), description: 'Consultation D', amount: 15000 },
    { date: new Date('2024-03-10'), description: 'Vente produits E', amount: 38000 },
    { date: new Date(), description: 'Recette du jour', amount: 25000 },
  ];

  for (const recette of recettes) {
    await prisma.recette.create({ data: recette });
  }

  // Sample Credits
  const credit1 = await prisma.credit.create({
    data: {
      clientName: 'Mohammed Tazi',
      totalAmount: 60000,
      paidAmount: 50000,
      date: new Date('2024-01-10'),
      notes: 'Crédit pour équipement',
      status: 'Partiellement Payé',
    },
  });

  await prisma.payment.createMany({
    data: [
      { creditId: credit1.id, amount: 30000, date: new Date('2024-01-20'), notes: 'Premier versement' },
      { creditId: credit1.id, amount: 20000, date: new Date('2024-02-15'), notes: 'Deuxième versement' },
    ],
  });

  const credit2 = await prisma.credit.create({
    data: {
      clientName: 'Aicha Berrada',
      totalAmount: 35000,
      paidAmount: 35000,
      date: new Date('2024-02-01'),
      notes: 'Crédit véhicule',
      status: 'Payé',
    },
  });

  await prisma.payment.create({
    data: { creditId: credit2.id, amount: 35000, date: new Date('2024-03-01'), notes: 'Paiement complet' },
  });

  const credit3 = await prisma.credit.create({
    data: {
      clientName: 'Youssef Benkirane',
      totalAmount: 90000,
      paidAmount: 0,
      date: new Date('2024-03-01'),
      notes: 'Crédit immobilier',
      status: 'Non Payé',
    },
  });

  console.log('✅ Seed complete!');
  console.log('📧 Admin: admin@gestionfinance.com');
  console.log('🔑 Password: admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
