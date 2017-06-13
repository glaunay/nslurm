var events = require('events');
var uuid = require('node-uuid');
var fs = require('fs');
var spawn = require('child_process').spawn;
var mkdirp = require('mkdirp');
const util = require('util');
const isStream = require('is-stream');
var path = require("path");
 /* The jobObject behaves like an emitter
     * Emitter exposes following event:
     *          'lostJob', {Object}jobObject : any job not found in the process pool
     *          'listError, {String}error) : the engine failed to list process along with error message
     *          'folderSetPermissionError', {String}msg, {String}err, {Object}job
     *          'scriptSetPermissionError', {String}err, {Object}job;
     *          'scriptWriteError', {String}err, {Object}job
     *          'scriptReadError', {String}err, {Object}job
     *          'inputError', {String}err, {Object}job
     *          'scriptReady'
     *          'ready'
     *          'submitted', {Object}job;
     *          'completed', {Stream}stdio, {Stream}stderr, {Object}job // this event raising is delegated to jobManager
*/





var _copyScript = function (job, fname/*, string*/, emitter) {

    var src = fs.createReadStream(job.script);
    src.on("error", function(err) {
        job.emit('scriptReadError', err, job);
        });
    var wr = fs.createWriteStream(fname);
    wr.on("error", function(err) {
        job.emit('scriptWriteError', err, job);
    });
    wr.on("close", function() {
        fs.chmod(fname,'777', function(err){
            if(err)
                job.emit('scriptSetPermissionError', err, job);
            else
                emitter.emit('scriptReady'/*, string*/);
        });
    });
    src.pipe(wr);
}


var jobIdentityFileWriter = function (job) {
    var serial = job.getSerialIdentity();
    var json = JSON.stringify(serial);
    fs.writeFileSync(job.workDir + '/jobID.json', json, 'utf8');
}

var batchDumper = function (job){
    var emitter = new events.EventEmitter();
    var batchContentString = "#!/bin/bash\n";
    var adress = job.emulated ? 'localhost' : job.adress;
    var trailer = 'echo "JOB_STATUS ' + job.id + ' FINISHED"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n";

    batchContentString += job.engineHeader; /// ENGINE SPECIFIC PREPROCESSOR LINES

    batchContentString += 'echo "JOB_STATUS ' + job.id + ' START"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n"

    if (job.exportVar) {
        for (var key in job.exportVar) {
            //string += 'export ' + key + '=' + job.exportVar[key] + '\n';
            batchContentString += key + '="' + job.exportVar[key] + '"\n';
        }
    }
    job.modules.forEach(function(e){
        batchContentString += "module load " + e;
    });

    if (job.script) {
        var fname = job.workDir + '/' + job.id + '_coreScript.sh';
        batchContentString += '. ' + fname + '\n' + trailer;
        _copyScript(job, fname, /*string,*/ emitter);
       /* This should not be needed, as _copyScript emits the ready event in async block
            setTimeout(function(){
            emitter.emit('ready', string);
        }, 5);
        */
    } else if(job.cmd) {
        batchContentString += job.cmd ? job.cmd : engine.testCommand;
        batchContentString += "\n" + trailer;
        setTimeout(function(){
            emitter.emit('ready', batchContentString);
        }, 5);
    } else {
        throw("You ask for a job but provided not command and script file");
    }

    emitter.on('scriptReady', function(){
        emitter.emit('ready', batchContentString);
    })
    return emitter;
}


/* Base Class, provide id generator and eventEmitter */
var Core = function(opt) {
    if (!opt) {
        console.log("generating random id");
        this.id = uuid.v4();
    } else if (! opt.hasOwnProperty('id')) {
        console.log("generating random id..");
        this.id = uuid.v4();
    } else if (!opt.id) {
        console.log("generating random id..");
        this.id = uuid.v4();
    } else {
        this.id = opt.id;
    }

    //console.log('this is core constructor');

    this.emitter = new events.EventEmitter();
}
Core.prototype.say = function() {
    console.log('hello');
}

/*Job Class
    sbatch parameters control

    NB: the detection of the "end" event is delegate to the UDP_port listener by jobManager

TODO

*/


/* Job constructor */
var Job = function (opt) {
    if (!opt.hasOwnProperty('id')) {
        throw ("Job constructor must be provided an uuid");
    }
    if(this.debugBool) {
        console.log("JOB OPTION CONTENT\n");
        console.dir(opt);
    }
    Core.call(this, opt);
    this.engineHeader = opt.engineHeader;
    this.submitBin = opt.submitBin;
    this.cmd = 'cmd' in opt ? opt.cmd : null; //the set of shell command to sbatch
    this.script = 'script' in opt ? opt.script : null; //the shell script to sbatch
    this.exportVar = 'exportVar' in opt ? opt.exportVar : null; //the shell script variable to export
    this.inputs = 'inputs' in opt ? opt.inputs : null; //the set inputs to copy in the $CWD/input folder
    this.tagTask = 'tagTask' in opt ? opt.tagTask : null;

    this.port = opt.port;
    this.adress = opt.adress;
    this.workDir = opt.workDir;

    this.cwd = 'cwd' in opt ? opt.cwd : null;
    this.cwdClone = 'cwdClone' in opt ? opt.cwdClone : false;

    this.MIA_jokers = 3; //  Number of time a job is allowed to not be found in the squeue
    this.modules = 'modules' in opt ? opt.modules : []; //the set of module to load

    this.debugBool = 'debugMode' in opt ? opt.debugMode : false;

    var self = this;
    mkdirp(this.workDir+ "/input", function (err) {
        if (err) {
            var msg = 'failed to create job ' + self.id + ' directory, ' + err;
            job.emit('folderCreationError', msg, err, job);
            return;
        }
        fs.chmod(self.workDir,'777', function(err){
            if (err) {
                var msg = 'failed to change perm job ' + self.id + ' directory, ' + err;
                job.emit('folderSetPermissionError', msg, err, job);
                return;
            }
            self.emit('workspaceCreated');
            self.setInput();
            self.setUp(opt);
        });
    });

};

Job.prototype = Object.create(Core.prototype);
Job.prototype.constructor = Job;

/* Job Methods */

Job.prototype.getSerialIdentity = function () {
    var serial = {};

    if (this.cmd) serial['cmd'] = this.cmd;
    if (this.script) serial['script'] = this.script;
    if (this.exportVar) serial['exportVar'] = this.exportVar;
    if (this.modules) serial['modules'] = this.modules;
    if (this.tagTask) serial['tagTask'] = this.tagTask;

    return serial;
}

// Copy specified inputs in the jobDir input folder
Job.prototype.setInput = function () {
    var self = this;
    if(!this.inputs) return;
    this.inputs.forEach(function(inputValue) {
        if (util.isString(inputValue)) {
            if (fs.existsSync(inputValue)) {
                // Do something
                fs.createReadStream(inputValue).pipe(fs.createWriteStream(self.workDir + '/input/' + path.basename(inputValue)));
            } else {
                var msg = "Supplied input \"" + inputValue + "\" was guessed a path to a file but no file found";
                self.emitter.emit('inputError', msg, self);
            }
        }
        else if (isStream(inputValue)) {
            // Where do we dump it ?
        }
        // Stream case
    });
}

// Process argument to create the string which will be dumped to an sbatch file
Job.prototype.setUp = function(data) {
    var self = this;
    var customCmd = false;
    this.emulated = 'emulated' in data ? data.emulated ? true : false :false;
    batchDumper(this).on('ready', function (string){
        var fname = self.workDir + '/' + self.id + '.batch';
        //if (self.emulated) fname = self.workDir + '/' + self.id + '.sh';
        fs.writeFile(fname, string, function(err) {
            if(err) {
                return console.log(err);
            }
            jobIdentityFileWriter(self);
            //process.exit();
            if (self.emulated)
                self.fork(fname);
            else
                self.submit(fname);
        });
    });
}

// Submit to slurm
Job.prototype.submit = function(fname) {
    var self = this;
    // do submission, raise submit 'event'
    // shell command
    //console.log(this.sbatch + ' ' + fname + ' ' + this.workDir);
    var submitArgArray = [fname];

    // USELESS : no "export" variable in Job object
    //if (this.export) {
    //    var expString = '--export=';
    //    expString += Object.keys(this.export).join(',');
    //    sbatchArgArray.push(expString);
    //}

    if (this.debugBool) {
        console.log('submitting w/, ' + this.submitBin + " " + submitArgArray);
        console.log('workdir : >' + this.workDir + '<');
    }

    var process = spawn(this.submitBin, submitArgArray, { 'cwd' : this.workDir });
    process.on('exit', function () {
        self.emitter.emit('submitted', self);
    });
}

Job.prototype.fork = function(fname) {
    var submitArgArray = [fname];
    if(this.debugBool)
        console.log('local [' + this.workDir + '] forking w/ sh ' + submitArgArray);
    var process = spawn('sh', submitArgArray,
                 { 'cwd' : this.workDir });
    if(this.emulated) {
        this.stdio = process.stdout;
        this._stderr = process.stderr;
    }
    this.emitter.emit('submitted', this);
}


Job.prototype.live = function() {
    var self = this
    this.ttlMark = setTimeout(function(){
        self.emitter.emit('timeOut');
    }, self.ttl);
}

Job.prototype.on = function(event, callback) {
    var self = this;
    self.emitter.on(event, callback);
}

Job.prototype.emit = function(){
    var argArray = [];
    for(var i = 0; i < arguments.length; i++) { 
        argArray.push(arguments[i]);
    }
    //console.log(argArray)
    this.emitter.emit.apply(this.emitter, argArray);
}

Job.prototype.stdout = function() {
    if (this.emulated) return this.stdio;
    var fNameStdout = this.hasOwnProperty('out') ? this.out : this.id + ".out";
    var fPath = this.workDir +'/' + fNameStdout;

    if (! fs.existsSync(fPath)) {
        if(this.debugBool) {
            console.log("cant find file " + fPath);
            console.log("forcing synchronicity...");
        }
        fs.readdirSync(this.workDir).forEach(function(fn){
            if(this.debugBool)
                console.log("ddirSync : " + fn);
        });
    }
    if (!fs.existsSync(fPath)) {
        if(this.debugBool)
            console.log("Output file error, Still cant open output file, returning empy stream");
        var Readable = require('stream').Readable;
        var dummyStream = new Readable();
        dummyStream.push(null);
        return dummyStream;
    }

    var stream = fs.createReadStream(fPath,  {'encoding' : 'utf8'})
    .on('error', function(m){
        var d = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
        if(this.debugBool) {
            console.log("[" + d + "] An error occured while creating read stream " + fPath);
            console.log(m);
        }
    });
    //stream.on("open", function(){ console.log("stdout stream opened");});
    //stream.on("end", function(){console.log('this is stdout END');});
    return stream;
}
Job.prototype.stderr = function() {
    if (this.emulated) return this._stderr;
    var fNameStderr = this.hasOwnProperty('err') ? this.err : this.id + ".err";
    var statErr;
    var bErr = true;
    try { 
        statErr = fs.statSync(this.workDir +'/' + fNameStderr);
    } catch(err) {
        bErr = false;
    }
    if(!bErr) return null;
    if(statErr.size === 0) return null;

    var stream = fs.createReadStream(this.workDir +'/' + fNameStderr);
    return stream;
}
module.exports = {
    createJob : function(opt){
        j = new Job(opt);
        return j;
    }
};
