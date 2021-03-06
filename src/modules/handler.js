//--------------------------------------------

var http = require("http"),
  exec = require("child_process").exec,
  fs = require('fs'),
  utils = require("dysf.utils").utils,
  log = require("dysf.utils").logger,
  v = require("./validator"),
  Q = require('q'),
  qs = require("querystring"),
  handler = exports;

//--------------------------------------------

var scer = null;
var scdPath = "/tmp/";
var audioPath = "/tmp/";
var sc_startFile = "./templates/sc_start.scd";
var sc_midFile = "./templates/sc_mid.scd";
var sc_endFile = "./templates/sc_end.scd";
var maxlength = 500;

//--------------------------------------------

//--------------------------------------------

handler.setSoundClouder = function (_scer) {
  log.debug("handler.setSoundClouder");
  scer = _scer;
}

handler.setCodeMaxLength = function (_maxlength) {
  maxlength = _maxlength;
}

//--------------------------------------------

handler.scconfig = function (request, response) {
  var guid = (new Date()).getTime();

  log.event("/scconfig Started. ip: " + request.ip + " guid=" + guid);

  var r = {
    client_id: scer.getConfig().client_id,
    redirect_uri: scer.getConfig().redirect_uri,
    guid: guid
  };

  response.json(r);

  log.event("/scconfig ended. guid=" + guid);
}

handler.process = function (request, response) {

  var guid = (new Date()).getTime();

  log.event("/process Started. ip: " + request.ip + " guid=" + guid);

  var sc_start = "";
  var sc_mid = "";
  var sc_end = "";
  var sc_params = "";
  var sc_txt = request.body.sccode;
  var duration = request.body.duration;
  var sc_data = "";
  var sclang_startup_time = 10;
  var sclang_timeout = 10;

  log.info("guid: " + guid);
  log.info("sccode: " + sc_txt);

  if (sc_txt.length > maxlength) {
    log.error("Code cannor be longer than " + maxlength + " characters. guid: " + guid);
    sendJsonError(response, 'Code cannot be longer than ' + maxlength + ' characters.');
    return;
  }

  var illegals = v.validate(sc_txt, guid);

  if (illegals.length > 0) {
    log.error("Invalid SC code for guid: " + guid);
    sendJsonError(response, 'Security Sandbox Violation: ' + illegals);
    return;
  }

  if (typeof (duration) == "undefined" || duration == "NaN" || duration == "-1" || duration == "0") {
    duration = 1;

  }

  var duration_seconds = parseInt(duration) + sclang_startup_time;

  //	request.connection.setKeepAlive( true, duration_seconds * 1000); 

  var sclang_timeout = duration_seconds * 1000;

  log.info("duration: " + duration);
  log.info("sclang_timeout: " + sclang_timeout);

  function readStartFile() {
    return Q.nfcall(fs.readFile, sc_startFile);
  }

  function readMidFile(data) {
    sc_start = data;
    return Q.nfcall(fs.readFile, sc_midFile);
  }

  function readEndFile(data) {
    sc_mid = data;
    return Q.nfcall(fs.readFile, sc_endFile);
  }

  function writeSCFile(data) {
    sc_end = data;

    sc_params = "~path = \"" + getAudioPath(guid) + "\";\n";
    sc_params += "~length = " + duration + ";";

    sc_data = sc_start + sc_params + sc_mid + sc_txt + sc_end;

    log.trace("Attempting to save: \n" + sc_data);

    return Q.nfcall(fs.writeFile, getScd(guid), sc_data);

  }

  function wrapUp(data) {
    var options = {
      timeout: sclang_timeout
    };

    log.info("Executing sclang " + getScd(guid) + " with timeout: " + sclang_timeout);

    exec("sclang " + getScd(guid), options, function (error, stdout, stderr) {

      log.info("sclang stdout:\n" + stdout);

      if (error) {
        log.error("sclang stderr:\n" + stderr);
        sendJsonError(response, stdout);
      } else {
        var r = {
          log: stdout,
          guid: guid
        };

        response.json(r);
      }

      log.event("/process ended. guid=" + guid);

    });
  }

  readStartFile()
    .then(readMidFile)
    .then(readEndFile)
    .then(writeSCFile)
    .then(wrapUp)
    .fail(function (err) {
      log.error("Error saving to '" + getScd(guid) + "'");
      sendJsonError(response, err);
    });

}

//--------------------------------------------

handler.render = function (request, response) {
  var guid = request.query.guid;

  log.event("/render guid=" + guid);

  response.download(getAudioPath(guid), getAudioName(guid), function (err) {
    if (err) {
      sendError(response, err);
    }
  });
}

//--------------------------------------------

handler.addTrackToSC = function (request, response) {
  var guid = request.body.guid;
  var sccode = request.body.code;
  var oauth_token = request.body.sctoken;

  log.event("/addTrackToSC guid=" + guid + " oauth_token: " + oauth_token);

  fs.readFile(getAudioPath(guid), function (err, data) {

    log.event("/addTrackToSC guid=" + guid + " file data Error?: " + err);

    if (err) {
      sendError(response, err);
    } else {
      var base64data = new Buffer(data).toString('base64');

      //log.event("data: " + base64data);

      scer.post('/tracks', oauth_token, {
          title: guid,
          description: sccode,
          asset_data: base64data
        },
        function (err, data) {
          log.event('/handler.addTrackToSC callback: ');
          log.info(data);

          var r = {
            url: (err) ? undefined : data.permalink_url,
            guid: guid
          };

          response.json(r);

        });
    }

  });
}

//--------------------------------------------

handler.sc = function (request, response) {

  var sccode = request.query.code;

  log.event("/sc Started. sccode=" + sccode);

  scer.auth(sccode, function (e, accesstoken) {

    if (e) {
      log.error("/sc Ended in error. sc.auth error.");
      log.error(e);
    } else {
      var replaceParams = {
        '%access_token%': accesstoken
      };
      log.info('/sc access_token=' + accesstoken);

      utils.renderFile(response, __dirname + '/..' + '/html/sc.html', replaceParams, function (err) {
        if (err) {
          log.error("/sc Ended in error. sccode=" + sccode);
          sendError(response, err);
        } else {
          log.event("/sc Ended. sccode=" + sccode);
        }
      });
    }
  });

}

//--------------------------------------------

function getScd(guid) {
  return scdPath + guid + ".scd";
}

function getAudioName(guid) {
  return guid + ".aiff";
}

function getAudioPath(guid) {
  return audioPath + getAudioName(guid);
}

//--------------------------------------------

function sendJsonError(response, err) {
  log.error(err);
  var r = {
    log: err,
    guid: null
  };
  response.json(r);

}

function sendError(response, err) {
  log.error(err);
  response.send(err);
}

//--------------------------------------------
