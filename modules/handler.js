//--------------------------------------------

var http = require("http"),
	exec = require("child_process").exec,
	fs = require('fs'),
	utils = require("dysf.utils").utils,
	log = require("dysf.utils").logger,
	v = require("./validator"),
	handler = exports;

//--------------------------------------------

var scer = null;
var scdPath = "/tmp/";
var audioPath = "/tmp/";
var sc_startFile = "./templates/sc_start.scd";
var sc_midFile = "./templates/sc_mid.scd";	
var sc_endFile = "./templates/sc_end.scd";

//--------------------------------------------


	
//--------------------------------------------

handler.setSoundClouder = function (_scer)
{
	log.debug("handler.setSoundClouder");
	scer = _scer;
}


//--------------------------------------------


handler.process = function (request, response) 
{

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
	
	if( sc_txt.length > 140  )
	{
		log.error("Code is longer than 140 characters: " + guid);    		
		sendJsonError(response, 'Code is longer than 140 characters.');
		return;
	}

	var illegals = v.validate(sc_txt, guid);
	
	if( illegals.length > 0  )
	{
		log.error("Invalid SC code for guid: " + guid);    		
		sendJsonError(response, 'Security Sandbox Violation: ' + illegals);
		return;
	}

	if(typeof(duration) == "undefined" || duration == "NaN" || duration == "-1" || duration == "0")
	{
		duration = 1;
	
	}
	
	var duration_seconds = parseInt(duration) + sclang_startup_time;

//	request.connection.setKeepAlive( true, duration_seconds * 1000); 

	var sclang_timeout = duration_seconds * 1000;

	log.info("duration: " + duration);
	log.info("sclang_timeout: " + sclang_timeout);
	
	fs.readFile(sc_startFile, function (err, data) {
		if (err) 
			sendJsonError(response, err);

		sc_start = data;

		fs.readFile(sc_midFile, function (err, data) {
			if (err) 
		    		sendJsonError(response, err);
	
			sc_mid = data;
			
			fs.readFile(sc_endFile, function (err, data) {
				if (err) 
					sendJsonError(response, err);

				sc_end = data;
				
				sc_params = "~path = \"" + getAudioPath(guid) + "\";\n";
				sc_params += "~length = " + duration + ";";
				
				sc_data = sc_start + sc_params + sc_mid + sc_txt + sc_end;
				
				log.trace("Attempting to save: \n" + sc_data);
				
				fs.writeFile( getScd(guid) , sc_data, function(err) {
			    	
					if(err) 
					{
			    				log.error("Error saving to '" + getScd(guid) + "'");    		
			    	    		sendJsonError(response, err);
			    	}
    	    
						log.info("Saved to '" + getScd(guid) + "'");
    	    
    	    				var options = { 
  						timeout: sclang_timeout
  					 };
					
					log.info("Executing sclang " + getScd(guid) + " with timeout: " + sclang_timeout);
  						
    	    				exec("sclang " + getScd(guid), options, function (error, stdout, stderr) {
    	    		
    	    					log.info("sclang stdout:\n" + stdout);
 
    	    					if(error) 
    	    					{
    	    						log.error("sclang stderr:\n" + stderr);
    	    						sendJsonError(response, stdout);

    	    					}
    	    					else
    	    					{
    	    						var r = {
    	    							log: stdout,
    	    							guid: guid
    	    						};
    	    			    	    			
    	    						response.json(r);
    	    					}
    	    					
								log.event("/process ended. guid=" + guid);  	


							}); 

				});			
				
	
			});

		});

	});

}

//--------------------------------------------

handler.render = function (request, response) 
{	
  	var guid = request.query.guid;

	log.event("/render guid=" + guid);  	
  	
	response.download( getAudioPath(guid), getAudioName(guid), function (err) {
		if (err) {
			sendError(response,err);
		}
	});
}

//--------------------------------------------

handler.sc = function (request, response) 
{

  	var sccode = request.query.code;

  	log.event("/sc Started. sccode=" + sccode);  	

  	
  	scer.auth(sccode, function (e, accesstoken) {

		if(e)
		{
			log.error("/sc Ended in error. sc.auth error.");
			log.error(e);
		}
		else
		{
	  		var replaceParams = {'%access_token%': accesstoken };
			log.info('/sc access_token=' + accesstoken );

  			utils.renderFile(response, __dirname + '/..' + '/html/sc.html', replaceParams, function (err) 
	  		{
  				if(err) 
  				{
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

function getScd(guid) 
{
	return scdPath + guid + ".scd";
}

function getAudioName(guid) 
{
	return guid + ".aiff";
}

function getAudioPath(guid) 
{
	return audioPath + getAudioName(guid);
}

//--------------------------------------------

function sendJsonError (response, err) 
{
	log.error(err);
	var r = {
		log: err,
		guid: null
	};
	response.json(r);
	
}

function sendError (response, err) 
{
	log.error(err);
	response.send(err);
}

//--------------------------------------------

