const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.raw({ type: 'application/json' }));
app.use(express.static('public'));

// MongoDB connection - Railway provides MONGO_URL
const mongoUri = process.env.MONGO_URL;

console.log('🔗 MongoDB Connection Debug:');
console.log('   MONGO_URL exists:', !!process.env.MONGO_URL);
console.log('   Connection string first 30 chars:', mongoUri ? mongoUri.substring(0, 30) + '...' : 'NO URI FOUND');

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
}).then(() => {
  console.log('✅ Connected to MongoDB successfully!');
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  console.error('   Make sure MONGO_URL is properly set in Railway variables');
});

// Mongoose connection events
mongoose.connection.on('connected', () => {
  console.log('📊 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('📊 Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('📊 Mongoose disconnected from MongoDB');
});

// Schemas
const customizationSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true },
  productId: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  textOptions: [Number],
  availablePlacements: [Number],
  availableFonts: [Number],
  defaultFont: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const globalSettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true },
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
    price: Number,
    coordinates: {
      x: Number,
      y: Number,
      maxWidth: Number,
      maxHeight: Number,
      rotation: Number
    }
  }],
  fonts: [{
    id: Number,
    name: String,
    code: String,
    price: Number,
    fontFile: String,
    displayName: String
  }],
  updatedAt: { type: Date, default: Date.now }
});

const orderQueueSchema = new mongoose.Schema({
  shopDomain: String,
  orderId: String,
  orderNumber: String,
  orderData: Object,
  customizations: Object,
  status: { type: String, default: 'pending', enum: ['pending', 'processing', 'completed', 'error'] },
  processedAt: Date,
  error: String,
  createdAt: { type: Date, default: Date.now }
});

// Models
const Customization = mongoose.model('Customization', customizationSchema);
const GlobalSettings = mongoose.model('GlobalSettings', globalSettingsSchema);
const OrderQueue = mongoose.model('OrderQueue', orderQueueSchema);

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get global settings for a shop
app.get('/api/settings/:shop', async (req, res) => {
  try {
    const { shop } = req.params;
    console.log(`📋 Fetching settings for shop: ${shop}`);
    
    let settings = await GlobalSettings.findOne({ shopDomain: shop });
    
    // Create default settings if none exist
    if (!settings) {
      console.log('🆕 Creating default settings for shop:', shop);
      settings = await GlobalSettings.create({
        shopDomain: shop,
        textOptions: [
          { id: 1, name: 'Player Name', maxLength: 15, basePrice: 0 },
          { id: 2, name: 'Custom Text', maxLength: 25, basePrice: 0 },
          { id: 3, name: 'Jersey Number', maxLength: 3, basePrice: 0 }
        ],
        placements: [
          { 
            id: 1, 
            name: 'Chest', 
            code: 'chest', 
            price: 5,
            coordinates: { x: 360, y: 250, maxWidth: 200, maxHeight: 60 }
          },
          { 
            id: 2, 
            name: 'Back', 
            code: 'back', 
            price: 5,
            coordinates: { x: 360, y: 300, maxWidth: 280, maxHeight: 100 }
          },
          { 
            id: 3, 
            name: 'Left Sleeve', 
            code: 'left_sleeve', 
            price: 7,
            coordinates: { x: 150, y: 320, maxWidth: 80, maxHeight: 40, rotation: -90 }
          },
          { 
            id: 4, 
            name: 'Right Sleeve', 
            code: 'right_sleeve', 
            price: 7,
            coordinates: { x: 150, y: 320, maxWidth: 80, maxHeight: 40, rotation: -90 }
          }
        ],
        fonts: [
          { id: 1, name: 'Standard', code: 'standard', price: 0, fontFile: 'Arial', displayName: 'Standard Font (Free)' },
          { id: 2, name: 'Varsity', code: 'varsity', price: 3, fontFile: 'Impact', displayName: 'Varsity Style (+$3)' },
          { id: 3, name: 'Script', code: 'script', price: 5, fontFile: 'BrushScriptMT', displayName: 'Script Style (+$5)' },
          { id: 4, name: 'Modern', code: 'modern', price: 3, fontFile: 'HelveticaNeue-Light', displayName: 'Modern Style (+$3)' }
        ]
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error('❌ Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update global settings
app.put('/api/settings/:shop', async (req, res) => {
  try {
    const { shop } = req.params;
    console.log(`🔄 Updating settings for shop: ${shop}`);
    
    const settings = await GlobalSettings.findOneAndUpdate(
      { shopDomain: shop },
      { ...req.body, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    
    res.json(settings);
  } catch (error) {
    console.error('❌ Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get product customization
app.get('/api/customization/:shop/:productId', async (req, res) => {
  try {
    const { shop, productId } = req.params;
    console.log(`🎨 Fetching customization for product ${productId} in shop ${shop}`);
    
    const customization = await Customization.findOne({ shopDomain: shop, productId });
    
    if (!customization) {
      return res.json({ 
        enabled: false,
        productId,
        shopDomain: shop
      });
    }
    
    res.json(customization);
  } catch (error) {
    console.error('❌ Error fetching customization:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update product customization
app.put('/api/customization/:shop/:productId', async (req, res) => {
  try {
    const { shop, productId } = req.params;
    console.log(`🔄 Updating customization for product ${productId} in shop ${shop}`);
    
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
    console.error('❌ Error updating customization:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook handler for order creation
app.post('/webhooks/orders/create', async (req, res) => {
  try {
    const shop = req.headers['x-shopify-shop-domain'];
    const topic = req.headers['x-shopify-topic'];
    const webhookId = req.headers['x-shopify-webhook-id'];
    
    console.log(`📦 Webhook received - Shop: ${shop}, Topic: ${topic}, ID: ${webhookId}`);
    
    // Verify webhook (if secret is set)
    if (process.env.SHOPIFY_WEBHOOK_SECRET) {
      const hash = req.headers['x-shopify-hmac-sha256'];
      const body = req.body;
      const calculatedHash = crypto
        .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
        .update(body, 'utf8')
        .digest('base64');
      
      if (hash !== calculatedHash) {
        console.error('❌ Webhook verification failed');
        return res.status(401).send('Unauthorized');
      }
    }
    
    // Parse order
    const order = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log(`📋 Processing order ${order.name} (${order.id})`);
    
    // Look for customized items
    const customizedItems = [];
    
    for (const item of order.line_items) {
      if (item.properties && item.properties.length > 0) {
        const props = {};
        item.properties.forEach(prop => {
          props[prop.name] = prop.value;
        });
        
        // Check if this item has customization
        if (props['Custom Text'] || props['Player Name'] || props['Jersey Number'] || props['Custom Message']) {
          customizedItems.push({
            lineItemId: item.id,
            productId: item.product_id,
            variantId: item.variant_id,
            sku: item.sku,
            title: item.title,
            quantity: item.quantity,
            properties: props
          });
        }
      }
    }
    
    // If there are customized items, add to queue
    if (customizedItems.length > 0) {
      console.log(`🎨 Found ${customizedItems.length} customized items`);
      
      const queueEntry = await OrderQueue.create({
        shopDomain: shop,
        orderId: order.id.toString(),
        orderNumber: order.name,
        orderData: {
          customer: {
            email: order.email,
            name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim()
          },
          createdAt: order.created_at
        },
        customizations: {
          items: customizedItems
        },
        status: 'pending'
      });
      
      console.log(`✅ Order ${order.name} added to processing queue`);
      
      // Here you would trigger the production file generation
      // For now, we'll just log it
      await generateProductionFile(queueEntry);
    } else {
      console.log(`ℹ️ Order ${order.name} has no customizations`);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate production file (placeholder for now)
async function generateProductionFile(queueEntry) {
  try {
    console.log(`🏭 Generating production file for order ${queueEntry.orderNumber}`);
    
    // Get shop settings
    const settings = await GlobalSettings.findOne({ shopDomain: queueEntry.shopDomain });
    
    const productionData = {
      order_id: queueEntry.orderId,
      order_number: queueEntry.orderNumber,
      created_at: new Date().toISOString(),
      customer: queueEntry.orderData.customer,
      line_items: []
    };
    
    // Process each customized item
    for (const item of queueEntry.customizations.items) {
      const customizations = [];
      
      // Parse customization data
      const props = item.properties;
      const placements = props['Placement'] ? props['Placement'].split(',').map(p => p.trim()) : [];
      
      // Determine which text to use
      const customText = props['Custom Text'] || props['Player Name'] || props['Jersey Number'] || props['Custom Message'] || '';
      
      if (customText && placements.length > 0) {
        // Get font info
        const fontDisplay = props['Font Style'] || 'Standard Font (Free)';
        const font = settings?.fonts.find(f => f.displayName === fontDisplay) || settings?.fonts[0];
        
        // Create customization for each placement
        placements.forEach(placementName => {
          const placement = settings?.placements.find(p => p.name === placementName);
          if (placement) {
            customizations.push({
              type: 'text',
              value: customText.toUpperCase(),
              placement: placement.code,
              font: font?.code || 'standard',
              color: 'white',
              coordinates: placement.coordinates
            });
          }
        });
      }
      
      if (customizations.length > 0) {
        productionData.line_items.push({
          id: item.lineItemId,
          product_id: item.productId,
          variant_id: item.variantId,
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          customizations: customizations
        });
      }
    }
    
    // Update queue status
    queueEntry.status = 'completed';
    queueEntry.processedAt = new Date();
    await queueEntry.save();
    
    console.log(`✅ Production data generated:`, JSON.stringify(productionData, null, 2));
    
    // In production, you would save this to a file or send to Illustrator
    // For now, we just log it
    
  } catch (error) {
    console.error('❌ Error generating production file:', error);
    queueEntry.status = 'error';
    queueEntry.error = error.message;
    await queueEntry.save();
  }
}

// Get order queue
app.get('/api/orders/:shop', async (req, res) => {
  try {
    const { shop } = req.params;
    const { status, limit = 50 } = req.query;
    
    const query = { shopDomain: shop };
    if (status) query.status = status;
    
    const orders = await OrderQueue.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({ 
      orders,
      count: orders.length
    });
  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all products with customization status (mock for now)
app.get('/api/products/:shop', async (req, res) => {
  try {
    const { shop } = req.params;
    console.log(`📦 Fetching products for shop: ${shop}`);
    
    // Get all customizations for this shop
    const customizations = await Customization.find({ shopDomain: shop });
    
    // In a real app, you would fetch products from Shopify API
    // For now, return mock data with customization status
    const mockProducts = [
      {
        id: '1234567890',
        title: 'Classic T-Shirt',
        handle: 'classic-t-shirt',
        image: 'https://via.placeholder.com/150',
        customization: customizations.find(c => c.productId === '1234567890') || { enabled: false }
      },
      {
        id: '0987654321',
        title: 'Sports Jersey',
        handle: 'sports-jersey',
        image: 'https://via.placeholder.com/150',
        customization: customizations.find(c => c.productId === '0987654321') || { enabled: false }
      }
    ];
    
    res.json({ products: mockProducts });
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// Widget endpoint - serves the dynamic widget script
app.get('/widget.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\n📋 Available endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /api/settings/:shop');
  console.log('  PUT  /api/settings/:shop');
  console.log('  GET  /api/customization/:shop/:productId');
  console.log('  PUT  /api/customization/:shop/:productId');
  console.log('  GET  /api/products/:shop');
  console.log('  GET  /api/orders/:shop');
  console.log('  POST /webhooks/orders/create');
  console.log('  GET  /widget.js');
});