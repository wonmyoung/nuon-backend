const { kakao_pfId, kakao_templateId_notice, smsOwnerPhoneNumer } = require("../config/env");

function createSendKakao(data, templateId, variables) {
    return {
        to: data.mobileNo,
        from: smsOwnerPhoneNumer,
        kakaoOptions: {
            pfId: kakao_pfId,
            templateId: templateId,
            variables: variables,
        },
    };
}
function createNoticeSendKakao(data) {
    const variables = {
        "#{이름}": data.username,
    };
    return createSendKakao(data, kakao_templateId_notice, variables);
}

module.exports = {
    createSendKakao,
    createNoticeSendKakao,
};