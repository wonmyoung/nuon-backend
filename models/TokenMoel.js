let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let TokenSchema = new Schema({
  mallId: { type: String },

  access_token: { type: String },
  refresh_token: { type: String },
  expires_at: { type: Number },
  refresh_expires_at: { type: Number },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: "" },
});

module.exports = mongoose.model("token", TokenSchema);
