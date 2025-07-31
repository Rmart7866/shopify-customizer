const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.raw({ type: 'application/json' }));
app.use(express.static('public'));

// MongoDB connection
mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost/shopify-custom-apparel', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// Simple customization schema
const customizationSchema = new mongoose.Schema({
  shopDomain: String,
  productId: String,
  enabled: { type: Boolean, default: false },
  settings: Object,
  updatedAt: { type: Date, default: Date.now }
});

const Customization = mongoose.model('Customization', customizationSchema);

// Global settings schema
const settingsSchema = new mongoose.Schema({
  shopDomain: { type: String, unique: true },
  textOptions: [{
    id: Number,
    name: String,
    maxLength: Number,
    basePrice: Number
  }],
  placements: [{
    id: Number,
    name: String,
    code: String,
    price: Number
  }],
  fonts: [{
    id: Number,
    name: String,
    code: String,
    price: Number,
    displayName: String
  }],
  updatedAt: { type: Date, default: Date.now }
});

const Settings = mongoose.model('Settings', settingsSchema);

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Get settings for a shop
app.get('/api/settings/:shop', async (req, res) => {
  try {
    const { shop } = req.params;
    let settings = await Settings.findOne({ shopDomain: shop });
    
    // Create default settings if none exist
    if (!settings) {
      settings = await Settings.create({
        shopDomain: shop,
        textOptions: [
          { id: 1, name: 'Player Name', maxLength: 15, basePrice: 0 },
          { id: 2, name: 'Custom Text', maxLength: 25, basePrice: 0 },
          { id: 3, name: 'Jersey Number', maxLength: 3, basePrice: 0 }
        ],
        placements: [
          { id: 1, name: 'Chest', code: 'chest', price: 5 },
          { id: 2, name: 'Back', code: 'back', price: 5 },
          { id: 3, name: 'Left Sleeve', code: 'left_sleeve', price: 7 },
          { id: 4, name: 'Right Sleeve', code: 'right_sleeve', price: 7 }
        ],
        fonts: [
          { id: 1, name: 'Standard', code: 'standard', price: 0, displayName: 'Standard Font (Free)' },
          { id: 2, name: 'Varsity', code: 'varsity', price: 3, displayName: 'Varsity Style (+$3)' },
          { id: 3, name: 'Script', code: 'script', price: 5, displayName: 'Script Style (+$5)' },
          { id: 4, name: 'Modern', code: 'modern', price: 3, displayName: 'Modern Style (+$3)' }
        ]
      });
    }
    
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
app.put('/api/settings/:shop', async (req, res) => {
  try {
    const { shop } = req.params;
    const settings = await Settings.findOneAndUpdate(
      { shopDomain: shop },
      { ...req.body, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product customization
app.get('/api/customization/:shop/:productId', async (req, res) => {
  try {
    const { shop, productId } = req.params;
    const customization = await Customization.findOne({ shopDomain: shop, productId });
    res.json(customization || { enabled: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product customization
app.put('/api/customization/:shop/:productId', async (req, res) => {
  try {
    const { shop, productId } = req.params;
    const customization = await Customization.findOneAndUpdate(
      { shopDomain: shop, productId },
      { 
        ...req.body, 
        shopDomain: shop,
        productId,
        updatedAt: new Date() 
      },
      { new: true, upsert: true }
    );
    res.json(customization);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint
app.post('/webhooks/orders/create', async (req, res) => {
  console.log('📦 Order webhook received');
  // Process order here
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});
