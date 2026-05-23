const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

const uploadDir = process.env.UPLOAD_DIR || './uploads';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|svg|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers image sont acceptés'));
    }
  },
});

// Settings routes (no auth required for local app)

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update setting
router.put('/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const setting = await prisma.setting.upsert({
      where: { key: req.params.key },
      update: { value },
      create: { key: req.params.key, value },
    });
    res.json(setting);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// Upload logo
router.post('/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

    const logoUrl = `/uploads/${req.file.filename}`;

    // Delete old logo
    const oldSetting = await prisma.setting.findUnique({ where: { key: 'logoUrl' } });
    if (oldSetting?.value) {
      const oldPath = path.join(uploadDir, path.basename(oldSetting.value));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await prisma.setting.upsert({
      where: { key: 'logoUrl' },
      update: { value: logoUrl },
      create: { key: 'logoUrl', value: logoUrl },
    });

    res.json({ logoUrl });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

module.exports = router;
