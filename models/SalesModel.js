let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let SalesSchema = new Schema({

  salesPrice: {
    type: Number,
  },
  netPrice: {
    type: Number,
  },
  tax: {
    type: Number,
  },
  fee: {
    type: Number,
  },
  mall: {
    type: String,
  },
  lastLogin: { type: Date, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: "" },
  dropedAt: { type: Date, default: "" },
});

module.exports = mongoose.model("sales", SalesSchema);
