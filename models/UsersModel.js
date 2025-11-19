let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let UsersSchema = new Schema({
  surveyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "basicSurvey",
    default: null,
  },
  email: {
    type: String,
  },
  project: {
    type: String,
  },
  companyName: {
    type: String,
  },
  username: {
    type: String,
  },
  phone: {
    type: String,
  },
  permission: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  userType: {
    //1.USER. 2.NORMAL_ADMIN 3.SUPER_ADMIN
    type: String,
  },
  auth: [],
  phone: {
    type: String,
  },
  password: {
    type: String,
  },
  termsOfService: {
    type: Boolean,
    default: false,
  },
  privacyPolicyConsent: {
    type: Boolean,
    default: false,
  },
  confidentialityAgreement: {
    type: Boolean,
    default: false,
  },
  manager: {
    //담당자
    type: String,
  },
  department: {
    //부서
    type: String,
  },
  memo: {
    type: String,
  },
  userSurveyStatus: {
    //대표자 설문 진행 단계 1.PENDING 2.WORKING 3.COMPLETED
    type: String,
    default: "PENDING",
  },
  consulantSurveyStatus: {
    //컨설턴트 설문 진행 단계 1.PENDING 2.WORKING 3.COMPLETED
    type: String,
    default: "PENDING",
  },
  lastLogin: { type: Date, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: "" },
  dropedAt: { type: Date, default: "" },
});

module.exports = mongoose.model("users", UsersSchema);
