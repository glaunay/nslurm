var events = require('events');
var uuid = require('node-uuid');
var fs = require('fs');
var spawn = require('child_process').spawn;
var chalk = require('chalk');



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



var sbatchDumper = function (job){
    var emitter = new events.EventEmitter();
    var string = "#!/bin/bash\n";
    var adress = job.emulated ? 'localhost' : job.adress;
    var trailer = 'echo -n  "JOB_STATUS ' + job.id + ' FINISHED"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n";

// Sbatch content invariant
    if (!job.emulated) {
        string += "#SBATCH -J " + job.id + "\n";
// User' specific sbatch parameters, TO BE COMPLETED
        var nNodes = job.hasOwnProperty('nNodes') ? job.nNodes ? job.nNodes : 1 : 1;
        string += "#SBATCH -N " + nNodes + " # Number of nodes, aka number of worker \n"
        var nCores = job.hasOwnProperty('nCores') ? job.nCores ? job.nCores : 1 : 1;
        string += "#SBATCH -n " + nCores + " # number of task, ie core\n"

        var tWall = job.hasOwnProperty('tWall') ? job.tWall  ? job.tWall : '0-00:05' : '0-00:05';
        string += "#SBATCH -t " + tWall + " # Runtime in D-HH:MM\n";
        var qos = job.hasOwnProperty('qos') ? job.qos : 'mobi-express';
        var partition = job.hasOwnProperty('partition') ? job.partition : 'mobi-express';
        string += "#SBATCH -p " + partition + " # Partition to submit to\n"
                + "#SBATCH --qos " + qos + " # Partition to submit to\n";

        var stdout = job.hasOwnProperty('out') ? job.out : job.id + ".out";
        string += "#SBATCH -o " + stdout + "\n";
        var stderr = job.hasOwnProperty('err') ? job.err : job.id + ".err";
        string += "#SBATCH -e " + stderr + "\n";

        if (job.hasOwnProperty('gid')) {
            string += "#SBATCH --gid " + job.gid + "\n";
        }
        if (job.hasOwnProperty('uid')) {
            string += "#SBATCH --uid " + job.uid + "\n";
        }
        if (job.gres != null) {
            string += "#SBATCH --gres=" + job.gres + "\n";
        }

        if (qos === "ws-dev" || qos === "gpu") { // NEW condition for GPU TODO
            string += "source /etc/profile.d/modules_cluster.sh\n";
            string += "source /etc/profile.d/modules.sh\n";
        }

        // NEW to load the modules
        job.modules.forEach(function(e){
            string += "module load " + e + '\n';
        });

// Sbatch command content
        string += 'echo -n  "JOB_STATUS ' + job.id + ' START"  | nc -w 2 ' + job.adress + ' ' + job.port + " > /dev/null\n"

    } else { // wrapper sbatch script for local/fork usage
        string += 'echo -n  "JOB_STATUS ' + job.id + ' START"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n"
       // string += 'WORKDIR=' + job.cwd;
    }
    // DONT DO THAT
    //string += 'export WORKDIR=' + job.workDir + '\n';
    if (job.exportVar) {
        for (var key in job.exportVar) {
            //string += 'export ' + key + '=' + job.exportVar[key] + '\n';
            string += key + '=' + job.exportVar[key] + '\n';
        }
    }

    if (job.cwd && job.cloneCwd)
        string += "cp -rf " + job.cwd + ' $WORKDIR';

// if script file provided, check/cp and call it
    if (job.script) {
        var fname = job.workDir + '/' + job.id + '_coreScript.sh';
        string += '. ' + fname + '\n' + trailer;
        _copyScript(job, fname, string, emitter);

    // just for tests
    } else {
        job.modules.forEach(function(e){
            string += "module load " + e;
        });
        string += job.cmd ? job.cmd : defaultCommand;
        string += trailer;
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
    Core.call(this, opt);

    this.ttl = opt.ttl; //default ttl is 5000ms
    this.modules = opt.modules; // module load ...
    this.gres = opt.gres; // gres sbatch option for GPU
    this.cmd = 'cmd' in opt ? opt.cmd : null; //the set of shell command to sbatch
    this.script = 'script' in opt ? opt.script : null; //the shell script to sbatch
    this.exportVar = 'exportVar' in opt ? opt.exportVar : null; //the shell script variable to export
    this.port = opt.port;
    this.adress = opt.adress;
    this.rootDir = opt.rootDir;
    this.workDir = this.rootDir + '/' + this.id;

    this.cwd = 'cwd' in opt ? opt.cwd : null;
    this.cwdClone = 'cwdClone' in opt ? opt.cwdClone : false;


    //console.dir(opt);
    this.sbatch = 'sbatch' in opt ? opt.sbatch : 'sbatch';
    //console.log(">>>>>> " + this.sbatch);
    var self = this;
    fs.mkdir(this.workDir, function (err) {
        if (err)
            throw 'failed to create job ' + self.id + ' directory, ' + err;
        fs.chmod(self.workDir,'777', function(err){
            if (err)
                throw 'failed to change perm job ' + self.id + ' directory, ' + err;
            self.emit('workspaceCreated');
            self.setUp(opt);
        });
    });
};

Job.prototype = Object.create(Core.prototype);
Job.prototype.constructor = Job;

/* Job Methods */

// Process argument to create the string which will be dumped to an sbatch file
Job.prototype.setUp = function(data) {
    var self = this;
    var customCmd = false;
    this.emulated = 'emulated' in data ? data.emulated ? true : false :false;

    if ('partition' in data){
        this.partition = data.partition;
    }
    if ('qos' in data){
        this.qos = data.qos;
    }
    if ('cmd' in data) {
        this.cmd = data.cmd;
    }
    if ('uid' in data){
        this.uid = data.uid;
    }
    if ('gid' in data){
        this.gid = data.gid;
    }
    if ('nNodes' in data){
        this.nNodes = data.nNodes;
    }
    if ('nCores' in data){
        this.nCores = data.nCores;
    }
    if ('tWall' in data){
        this.tWall = data.tWall;
    }
    if ('modules' in data){
        this.modules = data.modules;
    }
    if ('gres' in data){
        this.gres = data.gres;
    }

    sbatchDumper(this).on('ready', function (string){
        var fname = self.workDir + '/' + self.id + '.sbatch';
        if (self.emulated) fname = self.workDir + '/' + self.id + '.sh';
        fs.writeFile(fname, string, function(err) {
            if(err) {
                return console.log(err);
            }
            console.log("sbatch command written to " + fname);
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
    var sbatchArgArray = [fname];

    // USELESS : no "export" variable in Job object
    //if (this.export) {
    //    var expString = '--export=';
    //    expString += Object.keys(this.export).join(',');
    //    sbatchArgArray.push(expString);
    //}

    console.log('sbatch w/, ' + this.sbatch + sbatchArgArray);
    var process = spawn(this.sbatch, sbatchArgArray, { 'cwd' : this.workDir });

    this.emitter.emit('submitted', this);
}

Job.prototype.fork = function(fname) {
    var sbatchArgArray = [fname];
    console.log('local [' + this.workDir + '] forking w/ bash ' + sbatchArgArray);
    var process = spawn('sh', sbatchArgArray,
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
