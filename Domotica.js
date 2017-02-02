  'use strict';

  const
      request = require('request'),
      config = require('config'),
      unirest = require("unirest");

  // Generate a page access token for your page from the App Dashboard
  const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
      (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
      config.get('pageAccessToken');

  // URL where the app is running (include protocol). Used to point to scripts and 
  // assets located at this address.
  const SERVER_URL = (process.env.SERVER_URL) ?
      (process.env.SERVER_URL) :
      config.get('serverURL');

  const WOLFRAMEKEY = (process.env.WOLFRAMEKEY) ?
      (process.env.WOLFRAMEKEY) :
      config.get('wolframKey');

  /*
   * Call the Send API. The message data goes in the body. If successful, we'll 
   * get the message id in a response 
   *
   */
  function callSendAPI(messageData) {
      request({
          uri: 'https://graph.facebook.com/v2.8/me/messages',
          qs: {
              access_token: PAGE_ACCESS_TOKEN
          },
          method: 'POST',
          json: messageData

      }, function(error, response, body) {
          if (!error && response.statusCode == 200) {
              var recipientId = body.recipient_id;
              var messageId = body.message_id;
          } else {
              console.error(response.error);
          }
      });
  };

  var ActivarLuces = function(recipientId) {
      var messageData = {
          recipient: {
              id: recipientId
          },
          message: {
              attachment: {
                  type: "template",
                  payload: {
                      template_type: "generic",
                      elements: [{
                          title: "Domotica",
                          item_url: SERVER_URL,
                          subtitle: "Encienda las luces",
                          buttons: [{
                              type: "postback",
                              title: "Confirmar",
                              payload: "00003"
                          }, {
                              type: "postback",
                              title: "Cancelar",
                              payload: "00004"
                          }]
                      }]
                  }
              }
          }
      };
          callSendAPI(messageData);
  };
  module.exports.ActivarLuces = ActivarLuces;