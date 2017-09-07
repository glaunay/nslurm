var jsonfile = require('jsonfile');
var events = require('events');
var Readable = require('stream').Readable;


var jobManager = require('../index.js');

var parseConfig = function (fileName){
    var obj = jsonfile.readFileSync(fileName);
    return obj;
};

var scriptBatchTest = function(opt) {
    var template = require("./dummyJob/dummyJob.json");
    var jobOpt = {
            "inputs" : template.inputs,
            "script" : template.script,
            "exportVar" : template.exportVar
    };

    for (var key in opt) {
        console.log("option \"" + key + "\"will override \"dummyJob.json\" jobSettings, new value is  " +  opt[key]);
        jobOpt[key] = opt[key];
    }

    var s = new Readable();
    s.push("This is a stream content test");
    s.push(null);
    jobOpt.inputs["streamInputSymbol"] = s;

    var t = new Readable();
    t.push("stream content");
    t.push(null);
    jobOpt.inputs["anInput"] = t;

    //var testJob = jobManager.push(bean.test.keyProfile, jobOpt);
    var testJob = jobManager.push(null, jobOpt); // to test without jobProfile
    testJob.on("completed", function(stdout, stderr, jObj) {
        var content = 'stdout content:\n';
        stdout.on('data', function(buf) { content += buf.toString(); });
        stdout.on('end', function() {
            console.log(content);
        });

        if (indexTestBool) {
            var testPath = jobManager.getWorkDir({ 'script' : './dummyJob/dummyJob.sh' });
            console.log("Retrieve post--job work folders\n" + testPath);
        }


        if(stderr) {
            var contentError = 'stderr content:\n';
            stderr.on('data', function(buf) { contentError += buf.toString(); });
            stderr.on('end', function() {
                console.log(contentError);
            });
        }
    });
}

var cmdBatchTest = function(opt, jobCount) {
    console.log("Testing cmd batch " + jobCount + 'times');

    var jobOpt = bean.test.jobSettings;
    for (var key in opt) {
        console.log("option \"" + key + "\" will override \"test\" jobSettings, new value is  " +  opt[key]);
        jobOpt[key] = opt[key];
    }

    var jobArray = [];
    for (var i = 0; i < jobCount; i++) {
        var testJob = jobManager.push(bean.test.keyProfile, jobOpt);
        jobArray.push(testJob);
        jobArray[jobArray.length - 1].on("completed", function(stdout, stderr, jObj) {
            var content = '';
            stdout.on('data', function(buf) {
                content += buf.toString();
            });
            stdout.on('end', function() {
                console.log(content);
            });
        });
    }
}




var cacheDir, port, tcp, engineType;
var bean = {};
var testFunc = null;
var optCacheDir = [];
var indexTestBool = false;
var listTestBool = false;
var iJob = null;
var ttl = null;
process.argv.forEach(function (val, index, array){
    if (val === '--batch'){
        testFunc = scriptBatchTest;
    }
    if (val === '--dbg') {
        jobManager.debugOn();
    }
    if (val === '-u'){
        if (! array[index + 1])
            throw("usage : ");
        iJob = array[index + 1];
        testFunc = cmdBatchTest;
    }
    if (val === '--index'){
        indexTestBool = true;
    }
    if (val === '--list'){
        listTestBool = true;
    }
    if (val === '-p'){
        if (! array[index + 1])
            throw("usage : ");
        port = array[index + 1];
    }
    if (val === '-d'){
        if (! array[index + 1])
            throw("usage : ");
        cacheDir = array[index + 1];
        console.log("cacheDir is  ==> " + cacheDir);
    }
    if (val === '-a'){
        if (! array[index + 1])
            throw("usage : ");
        tcp = array[index + 1];
        console.log("ip adress is  ==> " + tcp);
    }
    if (val === '-e'){
        if (! array[index + 1])
            throw("usage : ");
        engineType = array[index + 1];
        console.log("Scheduler engine type is ==> " + engineType);
    }
    if (val === '-f'){
        if (! array[index + 1])
            throw("usage : ");
        bean = parseConfig(array[index + 1]);
        console.log("Config file content:\n");
        console.dir(bean);
    }
    if (val === '-c'){
        if (! array[index + 1])
            throw("usage : ");
        optCacheDir = array[index + 1].split(",");
        console.log("Optional cacheDir content:\n");
    }
    if (val === '-t'){
        if (! array[index + 1])
            throw("usage : ");
        ttl = array[index + 1];
    }
});

port = port ? port : bean.port;
tcp = tcp ? tcp : bean.tcp;
engineType = engineType ? engineType : bean.engineType;


if (indexTestBool) {
    optCacheDir.push(bean.cacheDir);
    jobManager.index(optCacheDir);
    
    var constraints = { 'cmd' : null };
    var testPath = jobManager.getWorkDir(constraints);
    console.log("Retrieve job work folders for the constraints : ")
    console.dir(constraints);
    console.log(testPath);
    
    console.log("-------------------\n");

    constraints = { 'script' : './dummyJob/dummyJob.sh' };
    testPath = jobManager.getWorkDir(constraints);
    console.log("Retrieve job work folders for the constraints : ")
    console.dir(constraints);
    console.log(testPath);

    var constraints = { 'cmd' : null };
    var testPath = jobManager.getWorkDir(constraints);
    console.log("Retrieve job work folders for the constraints : ")
    console.dir(constraints);
    console.log(testPath);

    constraints = { 'script' : './dummyJob/dummyJob2.sh' };
    testPath = jobManager.getWorkDir(constraints);
    console.log("Retrieve job work folders for the constraints : ")
    console.dir(constraints);
    console.log(testPath);
}



jobManager.configure({"engine" : engineType, "binaries" : bean.binaries });

if (listTestBool) {
    jobManager.engine().list()
        .on('data', function(msg) {
            console.log("Testing engine list function");
            console.dir(msg);
        });
}
jobManager.start({ 'cacheDir' : bean.cacheDir,
          'tcp' : tcp,
          'port' : port
      });
jobManager.on('exhausted', function(){
        console.log("All jobs processed");
    });

// Overriding default job options
var jobOpt = {}
if (ttl) jobOpt.ttl = ttl;

if(testFunc) {
    jobManager.on('ready', function() {testFunc(jobOpt, iJob);});
} else {
    console.log("No supplied submission test, exiting");
    process.exit(0);
}









// if stopping the process using Ctrl + C
process.on('SIGINT', function () {
    console.log(' Try to close the jobManager processes...');
    jobManager.stop()
    .on('cleanExit', function () {
        console.log("All pending jobs killed");
        process.exit(0);
    })
    .on('leftExit', function (nbLeft) {
        console.log(nbLeft + " jobs left pending");
        process.exit(0);
    })
    .on('emptyExit', function () {
        console.log("No job to kill")
        process.exit(0);
    })
    .on('cancelError', function (err) {
        console.log("Error during pending job cancelation");
        process.exit(1);
    })
    .on('listError', function (err) {
        console.log("Error during pending job listing");
        process.exit(1);
    });
});




