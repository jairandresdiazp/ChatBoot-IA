  /* jshint node: true, devel: true */
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

  const USER_ELIBOM = (process.env.USER_ELIBOM) ?
      (process.env.USER_ELIBOM) :
      config.get('userElibom');

  const PASS_ELIBOM = (process.env.PASS_ELIBOM) ?
      (process.env.PASS_ELIBOM) :
      config.get('passElibom');

  const TOKEN_LENGTH = (process.env.TOKEN_LENGTH) ?
      (process.env.TOKEN_LENGTH) :
      config.get('tokenLength');

  var elibom = require('elibom')(USER_ELIBOM, PASS_ELIBOM);

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

  var ActivarChatCeluCambio = function(DB, recipientId) {
      var Person = DB.ref("ChatCeluCambio/Admins");
      var DataChatCeluCambio;
      Person.on("value", function(data) {
          DataChatCeluCambio = data.val();
          var IndexConfig = Object.keys(DataChatCeluCambio);
          for (var index = 0; index < IndexConfig.length; index++) {
              var Admin = DataChatCeluCambio[IndexConfig[index]];
              if (Admin.ID === recipientId) {
                  console.log("si es admin " + Admin.ID + " Rece " + recipientId + "");
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
                                      title: "Configuracion",
                                      item_url: "http://www.celucambio.com/",
                                      subtitle: "Esta seguro de actualizar la configuracion de chat CeluCambio",
                                      buttons: [{
                                          type: "postback",
                                          title: "Activar",
                                          payload: "00005"
                                      }, {
                                          type: "postback",
                                          title: "Desactivar",
                                          payload: "00006"
                                      }]
                                  }]
                              }
                          }
                      }
                  };
                  callSendAPI(messageData);
              } else {
                  console.log("no es admin " + Admin.ID + " Rece" + recipientId + "");
                  var messageData = {
                      recipient: {
                          id: recipientId
                      },
                      message: {
                          text: "No tiene el nivel de acceso adecuado, Contactece con el administrador",
                          metadata: "DEVELOPER_DEFINED_METADATA"
                      }
                  };
                  callSendAPI(messageData);
              }
          }
      }, function(error) {
          console.log("The read failed: " + error);
      });
  };

  var SendMessageCambios = function(recipientId) {
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
                          title: "Cambios",
                          item_url: "http://www.celucambio.com/",
                          subtitle: "Puedes ver nuestros telefonos disponibles para cambio en nuestro sitio web",
                          buttons: [{
                              type: "web_url",
                              url: "http://www.celucambio.com/cambiar",
                              title: "Ver Telefonos"
                          }]
                      }]
                  }
              }
          }
      };
      callSendAPI(messageData);
  };

  var SendMessageUbicacion = function(recipientId) {
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
                          title: "CeluCambio",
                          item_url: "http://www.celucambio.com/",
                          subtitle: "Te enseñaremos la ruta usando Google Maps",
                          buttons: [{
                              type: "web_url",
                              url: "https://www.google.es/maps/dir//Cra.+29c+%2375-22,+Bogot%C3%A1,+Colombia/@4.6694833,-74.0731626,17z/data=!4m16!1m7!3m6!1s0x8e3f9af92c5f4049:0x413e44830baaa9c!2sCra.+29c+%2375-22,+Bogot%C3%A1,+Colombia!3b1!8m2!3d4.6694833!4d-74.0709739!4m7!1m0!1m5!1m1!1s0x8e3f9af92c5f4049:0x413e44830baaa9c!2m2!1d-74.0709739!2d4.6694833",
                              title: "Ver Mapa"
                          }]
                      }]
                  }
              }
          }
      };
      callSendAPI(messageData);
  };

var SendMessagePromocion = function(recipientId) {
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
                          title: "Cambios",
                          item_url: "http://www.celucambio.com/",
                          subtitle: "Para demostrarte que pudes cambiar tu telefono sin invertir mucho, tenemos estas promociones para ti",
                          buttons: [{
                              type: "web_url",
                              url: "http://www.celucambio.com/store/24-ofertas",
                              title: "Ver Ofertas"
                          }]
                      }]
                  }
              }
          }
      };
      callSendAPI(messageData);
  };

  module.exports.ActivarChatCeluCambio = ActivarChatCeluCambio;
  module.exports.SendMessageCambios = SendMessageCambios;
  module.exports.SendMessageUbicacion = SendMessageUbicacion;
  module.exports.SendMessagePromocion = SendMessagePromocion;