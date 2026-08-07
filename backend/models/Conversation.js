const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  user_id: { type: String, required: true },  
  title: { type: String, default: "New Chat" },
  messages: { type: Array, default: [] }        
}, { timestamps: true });  

module.exports = mongoose.model('Conversation', conversationSchema);