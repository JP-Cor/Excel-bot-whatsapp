const express = require('express');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const multer = require('multer');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const app = express();
//const PORT = 3000;
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const EXCEL_PATH = path.join(DATA_DIR, 'contactos.xlsx');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Si no existe el Excel principal, crear uno vacío con encabezados
if (!fs.existsSync(EXCEL_PATH)) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([], {
    header: ['Nombre', 'Servicio', 'Contacto', 'Estado']
  });
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, EXCEL_PATH);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});

const upload = multer({ storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());



let whatsappReady = false;
let currentQrBase64 = null;
let qrStatus = 'iniciando';
const chromePath =
process.env.PUPPETEER_EXECUTABLE_PATH ||
  '/opt/render/project/src/.puppeteer-cache/chrome/linux-146.0.7680.153/chrome-linux64/chrome';

console.log('Chrome path:', chromePath);
console.log('Chrome exists:', fs.existsSync(chromePath));

const client = new Client({

  
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ]
  }
});

client.on('qr', async (qr) => {
  console.log('\n📲 Escanea este QR con tu WhatsApp:\n');
  qrcode.generate(qr, { small: true });

  currentQrBase64 = await QRCode.toDataURL(qr);
  qrStatus = 'qr';
  whatsappReady = false;
});

client.on('ready', () => {
  whatsappReady = true;
  currentQrBase64 = null;
  qrStatus = 'ready';
  console.log('✅ WhatsApp conectado correctamente');
});

client.on('authenticated', () => {
  qrStatus = 'authenticated';
  console.log('🔐 WhatsApp autenticado');
});

client.on('disconnected', () => {
  whatsappReady = false;
  currentQrBase64 = null;
  qrStatus = 'disconnected';
  console.log('⚠️ WhatsApp desconectado');
});

client.initialize();

function leerExcel() {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function guardarExcel(datos) {
  const workbook = XLSX.utils.book_new();
  const headers = ['Nombre', 'Servicio', 'Contacto', 'Estado'];

  const hoja = XLSX.utils.json_to_sheet(
    datos.map(item => ({
      Nombre: item.Nombre || '',
      Servicio: item.Servicio || '',
      Contacto: item.Contacto || '',
      Estado: item.Estado || ''
    })),
    { header: headers }
  );

  XLSX.utils.book_append_sheet(workbook, hoja, 'Clientes');
  XLSX.writeFile(workbook, EXCEL_PATH);
}

function marcarEstado(contacto, estado) {
  const datos = leerExcel();

  const actualizados = datos.map(cliente => {
    if (String(cliente.Contacto).trim() === String(contacto).trim()) {
      return { ...cliente, Estado: estado };
    }
    return cliente;
  });

  guardarExcel(actualizados);
}

// Descargar plantilla vacía
app.get('/api/descargar-plantilla', (req, res) => {
  try {
    const plantillaPath = path.join(DATA_DIR, 'plantilla_clientes.xlsx');

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([], {
      header: ['Nombre', 'Servicio', 'Contacto', 'Estado']
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, plantillaPath);

    res.download(plantillaPath, 'plantilla_clientes.xlsx');
  } catch (error) {
    console.error('Error creando plantilla:', error);
    res.status(500).json({ error: 'No se pudo descargar la plantilla' });
  }
});

app.get('/api/qr', (req, res) => {
  res.json({
    ready: whatsappReady,
    status: qrStatus,
    qr: currentQrBase64
  });
});

// Subir Excel desde la PC
app.post('/api/subir-excel', upload.single('excel'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se seleccionó ningún archivo Excel' });
    }

    const rutaTemporal = req.file.path;
    const wb = XLSX.readFile(rutaTemporal);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const datos = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const datosNormalizados = datos.map(item => ({
      Nombre: item.Nombre || '',
      Servicio: item.Servicio || '',
      Contacto: item.Contacto || '',
      Estado: item.Estado || ''
    }));

    guardarExcel(datosNormalizados);

    res.json({
      ok: true,
      mensaje: 'Excel cargado correctamente'
    });
  } catch (error) {
    console.error('Error subiendo Excel:', error);
    res.status(500).json({ error: 'No se pudo procesar el archivo Excel' });
  }
});

app.get('/api/clientes', (req, res) => {
  try {
    const datos = leerExcel();
    res.json(datos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo leer el Excel' });
  }
});

app.get('/api/whatsapp-status', (req, res) => {
  res.json({ ready: whatsappReady });
});

app.post('/api/marcar-enviado', (req, res) => {
  try {
    const { Contacto } = req.body;

    if (!Contacto) {
      return res.status(400).json({ error: 'Falta el contacto' });
    }

    marcarEstado(Contacto, 'Enviado');
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo marcar como enviado' });
  }
});

app.post(
  '/api/enviar-automatico',
  upload.fields([
    { name: 'imagen', maxCount: 1 },
    { name: 'pdf', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { Nombre, Servicio, Contacto, mensaje } = req.body;

      if (!whatsappReady) {
        return res.status(400).json({ error: 'WhatsApp no está conectado' });
      }

      if (!Contacto) {
        return res.status(400).json({ error: 'Falta el contacto' });
      }

      const numeroLimpio = String(Contacto).replace(/\D/g, '');
      const chatId = `506${numeroLimpio}@c.us`;

      let mensajeFinal = String(mensaje || '').trim()
        .replace(/\{Nombre\}/g, Nombre || '')
        .replace(/\{Servicio\}/g, Servicio || '')
        .replace(/\{Contacto\}/g, Contacto || '');

      if (mensajeFinal) {
        await client.sendMessage(chatId, mensajeFinal);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      if (req.files && req.files.imagen && req.files.imagen[0]) {
        const rutaImagen = req.files.imagen[0].path;
        const mediaImagen = MessageMedia.fromFilePath(rutaImagen);
        await client.sendMessage(chatId, mediaImagen);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      if (req.files && req.files.pdf && req.files.pdf[0]) {
        const rutaPdf = req.files.pdf[0].path;
        const mediaPdf = MessageMedia.fromFilePath(rutaPdf);
        await client.sendMessage(chatId, mediaPdf);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      marcarEstado(Contacto, 'Enviado');

      res.json({
        ok: true,
        mensaje: 'Enviado correctamente'
      });
    } catch (error) {
      console.error('Error en envío automático:', error);
      res.status(500).json({ error: 'No se pudo realizar el envío' });
    }
  }
);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});