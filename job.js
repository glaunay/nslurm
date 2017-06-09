var events = require('events');
var uuid = require('node-uuid');
var fs = require('fs');
var spawn = require('child_process').spawn;
var mkdirp = require('mkdirp');
const util = require('util');
const isStream = require('is-stream');

var _copyScript = function (job, fname, string, emitter) {

    var src = fs.createReadStream(job.script);
    src.on("error", function(err) {
        job.emit('error', err, job);
        });
    var wr = fs.createWriteStream(fname);
    wr.on("error", function(err) {
        job.emit('error', err, job);
    });
    wr.on("close", function() {
        fs.chmod(fname,'777', function(err){
            if(err)
                job.emit('error', err, job);
            else
                emitter.emit('ready', string);
        });
    });
    src.pipe(wr);
}

var jobIdentityFileWriter = function (job) {
    var serial = {};

    if (job.cmd) serial['cmd'] = job.cmd;
    if (job.script) serial['script'] = job.script;
    if (job.exportVar) serial['exportVar'] = job.exportVar;
    if (job.modules) serial['modules'] = job.modules;

    var json = JSON.stringify(serial);
    fs.writeFileSync(job.workDir + '/jobID.json', json, 'utf8');
}

var batchDumper = function (job){
    var emitter = new events.EventEmitter();
    var string = "#!/bin/bash\n";
    var adress = job.emulated ? 'localhost' : job.adress;
    var trailer = 'echo "JOB_STATUS ' + job.id + ' FINISHED"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n";

    string += job.engineHeader; /// ENGINE SPECIFIC PREPROCESSOR LINES

    string += 'echo "JOB_STATUS ' + job.id + ' START"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n"

    if (job.exportVar) {
        for (var key in job.exportVar) {
            //string += 'export ' + key + '=' + job.exportVar[key] + '\n';
            string += key + '=' + job.exportVar[key] + '\n';
        }
    }
    job.modules.forEach(function(e){
        string += "module load " + e;
    });

// if script file provided, check/cp and call it
    if (job.script) {
        var fname = job.workDir + '/' + job.id + '_coreScript.sh';
        string += '. ' + fname + '\n' + trailer;
        _copyScript(job, fname, string, emitter);
        setTimeout(function(){
            emitter.emit('ready', string);
        }, 5);
    // just for tests
    } else {
        string += job.cmd ? job.cmd : defaultCommand;
        string += "\n" + trailer;
        setTimeout(function(){
            emitter.emit('ready', string);
        }, 5);
    }
    return emitter;
}


var defaultCommand =
    "echo '---'\n"
  + "echo $WORKDIR\n"
  + "echo '---'\n"
  + "env\n"
  + "echo '---'\n"
  + "pwd\n"
  + "echo '---'\n"
  + "cd ${WORKDIR}\n"
  + "cp ${SLURM_SUBMIT_DIR} ./\n"
  + "module load numpy\n"
  + "sleep 5\n";





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

/*Job Class provides TimeToLive Managment
    sbatch parameters control

    NB: the detection of the end event is delegate to the UDP_port listener "nSlurm.manager"

TODO

*/


/* Job constructor */
var Job = function (opt) {
    if (!opt.hasOwnProperty('id')) {
        throw ("Job constructor must be provided an uuid");
    }
    console.log("JOB OPTION CONTENT\n");
    console.dir(opt);
    Core.call(this, opt);
    this.batch = opt.batch;
    this.engineHeader = opt.engineHeader;
    this.submitBin = opt.submitBin;
    this.cmd = 'cmd' in opt ? opt.cmd : null; //the set of shell command to sbatch
    this.script = 'script' in opt ? opt.script : null; //the shell script to sbatch
    this.exportVar = 'exportVar' in opt ? opt.exportVar : null; //the shell script variable to export
    this.inputs = 'inputs' in opt ? opt.inputs : null; //the set inputs to copy in the $CWD/input folder

    this.port = opt.port;
    this.adress = opt.adress;
    this.rootDir = opt.rootDir;
    this.workDir = this.rootDir + '/' + this.id;

    this.cwd = 'cwd' in opt ? opt.cwd : null;
    this.cwdClone = 'cwdClone' in opt ? opt.cwdClone : false;

    this.MIA_jokers = 3; //  Number of time a job is allowed to not be found in the squeue
    this.modules = 'modules' in opt ? opt.modules : []; //the set of module to load


    var self = this;
    mkdirp(this.workDir+ "/input", function (err) {
        if (err)
            throw 'failed to create job ' + self.id + ' directory, ' + err;
        fs.chmod(self.workDir,'777', function(err){
            if (err)
                throw 'failed to change perm job ' + self.id + ' directory, ' + err;
            self.emit('workspaceCreated');
            self.setInput();
            self.setUp(opt);
        });
    });

};

Job.prototype = Object.create(Core.prototype);
Job.prototype.constructor = Job;

/* Job Methods */

// Copy specified inputs in the jobDir input folder
Job.prototype.setInput = function () {
    for (var inputValue in this.inputs) {
        if (util.isString(inputValue)) {
            if (fs.existsSync(path)) {
                // Do something
                fs.createReadStream(inputValue).pipe(fs.createWriteStream(this.workDir + '/input/' + path.basename(inputValue)));
            } else {
                console.warn("Supplied input \"" + inputValue + "\"was guessed a path to a file but no file found")
            }
        }
        else if (isStream(inputValue)) {
            // Where do we dump it ?
        }
        // Stream case
    }
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


    console.log('submitting w/, ' + this.submitBin + " " + submitArgArray);
    console.log('workdir : >' + this.workDir + '<');

    var process = spawn(this.submitBin, submitArgArray, { 'cwd' : this.workDir });
    process.on('exit', function () {
        self.emitter.emit('submitted', self);
    });
}

Job.prototype.fork = function(fname) {
    var submitArgArray = [fname];
    console.log('local [' + this.workDir + '] forking w/ bash ' + submitArgArray);
    var process = spawn('sh', submitArgArray,
                 { 'cwd' : this.workDir });
    if(this.emulated) {
        this.stdio = process.stdout;
        this.stdie = process.stderr;
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
        console.log("cant find file " + fPath);
        console.log("forcing synchronicity...");
        fs.readdirSync(this.workDir).forEach(function(fn){
            console.log("ddirSync : " + fn);
        });
    }
    if (! fs.existsSync(fPath)) {
        console.log("Output file error, Still cant open output file, returning empy stream");
        var Readable = require('stream').Readable;
        var dummyStream = new Readable();
        dummyStream.push(null);
        return dummyStream;
    }

    var stream = fs.createReadStream(fPath,  {'encoding' : 'utf8'})
    .on('error', function(m){
        var d = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
        console.log("[" + d + "] An error occured while creating read stream " + fPath);
        console.log(m);
    });
    //stream.on("open", function(){ console.log("stdout stream opened");});
    //stream.on("end", function(){console.log('this is stdout END');});
    return stream;
}
Job.prototype.stderr = function() {
    if (this.emulated) return this.stdie;
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
