var jsonfile = require('jsonfile');
var events = require('events');
var Readable = require('stream').Readable;


var jobManager = require('../index.js');

var parseConfig = function (fileName){
    var obj = jsonfile.readFileSync(fileName);
    return obj;
};

var scriptBatchTest = function() {
    var template = require("./dummyJob/dummyJob.json");
    var jobOpt = {
            "inputs" : template.inputs,
            "script" : template.script,
            "exportVar" : template.exportVar
        };
    var s = new Readable();
    s.push("This is a stream content test");
    s.push(null);
    jobOpt.inputs["streamInputSymbol"] = s;
    console.log("Ok");
    var testJob = jobManager.push(bean.test.keyProfile, jobOpt);
    testJob.on("completed", function(stdout, stderr, jObj) {
        var content = '';
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

var cmdBatchTest = function(jobCount) {
    console.log("Testing cmd batch " + jobCount + 'times');
    var jobArray = [];
    for (var i = 0; i < jobCount; i++) {
        var testJob = jobManager.push(bean.test.keyProfile, bean.test.jobSettings);
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
});

port = port ? port : bean.port;
tcp = tcp ? tcp : bean.tcp;
engineType = engineType ? engineType : bean.engineType;


if (indexTestBool) {
    optCacheDir.push(bean.cacheDir);
    jobManager.index(optCacheDir);
    var testPath = jobManager.getWorkDir({ 'cmd' : null });
    console.log("Retrieve job work folders\n" + testPath);
    console.log("-------------------\n");
    testPath = jobManager.getWorkDir({ 'script' : './dummyJob/dummyJob.sh' });
    console.log("Retrieve job work folders\n" + testPath);
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

if(testFunc) {
    jobManager.on('ready', function() {testFunc(iJob);});
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




