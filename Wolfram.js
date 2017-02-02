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

  var Client = require('node-wolfram');
  var Wolfram = new Client(WOLFRAMEKEY);
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

  var SolveWolfram = function(recipientId, input) {
      var respuesta = " ";
      var messageData = " ";
      try {
          Wolfram.query(input.trim(), function(err, result) {
              if (err) {
                  messageData = {
                      recipient: {
                          id: recipientId
                      },
                      message: {
                          text: "No pudimos resolver esta solicitud " + err,
                          metadata: "Wolfram"
                      }
                  };
                  callSendAPI(messageData);
              } else {
                  try {
                      for (var a = 0; a < result.queryresult.pod.length; a++) {
                          var pod = result.queryresult.pod[a];
                          respuesta = respuesta + pod.$.title + ": ";
                          for (var b = 0; b < pod.subpod.length; b++) {
                              var subpod = pod.subpod[b];
                              for (var c = 0; c < subpod.plaintext.length; c++) {
                                  var text = subpod.plaintext[c];
                                  respuesta = respuesta + text + "\n";
                              }
                          }
                      }
                  } catch (error) {
                      respuesta = "No pudimos resolver esta solicitud ";
                  }
                  messageData = {
                      recipient: {
                          id: recipientId
                      },
                      message: {
                          text: respuesta.substr(0, 320),
                          metadata: "Wolfram"
                      }
                  };
                  callSendAPI(messageData);
              }
          });
      } catch (error) {
          messageData = {
              recipient: {
                  id: recipientId
              },
              message: {
                  text: "No pudimos resolver esta solicitud " + error,
                  metadata: "Wolfram"
              }
          };
          callSendAPI(messageData);
      }
  };
  module.exports.SolveWolfram = SolveWolfram;