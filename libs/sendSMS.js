const key = require("../config/env");
const { config, msg } = require('solapi')

// const { msg } = require('../../')
console.log("key.smsApiKey", key.smsApiKey)
console.log("key.smsApiSecret", key.smsApiSecret)
config.init({
    apiKey: key.smsApiKey,
    apiSecret: key.smsApiSecret
})
module.exports = async function sendSMS(params = {}) {
    console.log("params", params)
    try {
        const result = await msg.send(params)
        console.log('RESULT:', result)
        return true
    } catch (e) {
        console.log('statusCode:', e.statusCode)
        console.log('errorCode:', e.error.errorCode)
        console.log('errorMessage:', e.error.errorMessage)
        return false
    }
}