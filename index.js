var fs = require('fs');  // file system
var uuid = require('node-uuid');
var events = require('events');
var net = require('net');
var jobLib = require('./job');
var path = require('path');
var clone = require('clone');

var sgeLib = require('./lib/sge');
var slurmLib = require('./lib/slurm');
var emulatorLib = require('./lib/emulator');
var engine = null;

var TCPport = 2222;
var TCPip = null;
var scheduler_id = uuid.v4();
var dataLength = 0;
var id = '00000'
var core = null;

var cacheDir = null;
var probPreviousCacheDir = []; // list of the probable cacheDir used in previous nslurm instances

var jobProfiles = {};

var jobsArray = {};

var eventEmitter = new events.EventEmitter();

var exhaustBool = false; // set to true at any push, set to false at exhausted event raise

var emulator = false; // Trying to keep api/events intact while running job as fork on local

var isStarted = false;

// Set scheduler engine and emulation state
var configure = function (opt) {
    console.log("\n\n############ENGINE CONFIGURATION OPTIONS############\n");
    console.dir(opt);
    console.log("\n####################################################\n");
    if(!opt.hasOwnProperty('engine')) throw("Please specify a scheduler engine");
    if(opt.engine === "sge")
        engine = sgeLib;
    else if(opt.engine === "slurm")
        engine = slurmLib;
    else if (opt.engine === "emulator") {
        engine = emulatorLib;
        emulator = true;
    }
    if (opt.engine != "emulator") {
        if(!opt.hasOwnProperty('binaries')) throw "You must specify scheduler engine binaries";
    }
    engine.configure(opt.binaries, jobsArray);
    console.log("Engine configured is " + engine.type());
}

var _checkBinariesSpecs = function(opt) {
    var vKeys = ["cancelBin", "queueBin", "submitBin"];
    var msg = "Missing engine binaries parameters keys \"cancelBin\", \"queueBin\", \"submitBin\"";
    for (var k in vKeys)
        if (!opt.hasOwnProperty(k))
            throw(msg);
    engine.configure(opt);
}


var drawJobNumber = function () {
    return uuid.v4();
}

module.exports = {
    engine : function(){ return engine;},
    emulate : function(){ emulator = true; },
    isEmulated : function(){ return emulator; },
    configure : configure,

    on : function(eventName, callback) { //
        eventEmitter.on(eventName, callback);
    },
    cacheDir : function() {return cacheDir;},
    /*
    * concatene two variables in json format
    */
    concatJson: function (json1, json2) {
        var newJson = JSON.parse(JSON.stringify(json1));
        for (var key in json2) {
            if (json1.hasOwnProperty(key)) {
                console.log(json1);
                console.log(json2);
                throw 'ERROR : same property in both JSON above : ' + key;
            } else newJson[key] = json2[key];
        }
        return newJson;
    },

    /*
    * For a list of directories, find task directories and return them.
    * TWO LEVELS OF RESEARCH :
    * 1/ a directory in the list can be a task directory -> check the name of the directory
    * 2/ or can contain task directories -> search inside the directory & check the sub-directory names
    *
    * TASK DIRECTORY CONVENTION :
    * The name of a task directory is composed of the task tag (exemple : "naccess")
    * with "Task_" and the unique id (uuid) and eventually a little string at the end (exemple : "_hex_25")
    */

    findTaskDir : function(tagTask) {
        if (! tagTask) throw 'ERROR : no tag task specified !';
        // convention of writing the task directory name
        var re_taskDir = tagTask + 'Task_[\\S]{8}-[\\S]{4}-[\\S]{4}-[\\S]{4}-[\\S]{12}_{0,1}[\\S]*';
        var re_inputDir = tagTask + 'Task_[\\S]{8}-[\\S]{4}-[\\S]{4}-[\\S]{4}-[\\S]{12}_inputs';
        var taskDirs = [];

        probPreviousCacheDir.map(function (dir) { // read the list of directories
            try { var files = fs.readdirSync(dir); } // read content of the task directory (3)
            catch (err) {
                console.log(err);
                return;
            }
            // LEVEL 1
            files.filter(function (file) {
                return file.match(re_taskDir); // check writing convention of the name
            }).filter(function (file) {
                return !file.match(re_inputDir); // not the input directories
            }).map(function (file) {
                return path.join(dir, file); // use full path
            }).filter(function (file) {
                return fs.statSync(file).isDirectory(); // only directories
            }).map(function (file) {
                return taskDirs.push(file);
            });

            files.map(function (file) {
                return path.join(dir, file);
            }).filter(function (file) {
                return fs.statSync(file).isDirectory();
            }).map(function (file) {
                // LEVEL 2
                return fs.readdirSync(file).filter(function (subFile) {
                    return subFile.match(re_taskDir); // check writing convention of the name
                }).filter(function (subFile) {
                    return !subFile.match(re_inputDir); // not the input directories
                }).map(function (subFile) {
                    return path.join(file, subFile); // use full path
                }).filter(function (subFile) {
                    return fs.statSync(subFile).isDirectory(); // only directories
                }).map(function (subFile) {
                    return taskDirs.push(subFile);
                });
            });
            // next 3 lines for tests
            console.log(taskDirs)
            //taskDirs = ['/Users/mgarnier/Documents/Developpement/taskObjectTest/tmp/forceCache/simpleTask_1f3fe83c-71ba-4c90-beaa-4e2f6bad7028'];
            console.log(taskDirs)
        });
        return taskDirs;
    },


    /*
    * Select a job profile (depending on "partition", "qos", "gid", "uid", etc.)
    */
    selectJobProfile : function(key) {
        if (! jobProfiles) console.log("WARNING : No jobProfiles detected !");
        else {
            if (jobProfiles.hasOwnProperty(key)) return jobProfiles[key];
            else throw "ERROR : No " + key + " in jobProfiles !";
        }
    },


    /**
    * Display on console.log the current list of "pushed" jobs and their status
    *
    * @param  None
    * @return null
    */
    jobsView : function(){
        var displayString = '###############################\n'
                          + '###### Current jobs pool ######\n'
                          + '###############################\n';
        var c = 0;
        for (var key in jobsArray) {;
            c++;
            displayString += '# ' + key + ' : ' + jobsArray[key].status + '\n';
        }
        if (c===0)
            displayString += '          EMPTY               \n';
        console.log(displayString);
        return null;

    },

    /*
    * This method manipulate the object gived by _squeue()
    */
    queueReport : function() {
        return engine.queueReport;
    }
   ,


    /*
    * Check the existence of our jobs (present in jobsArray) in the squeue.
    */
    jobWarden : function () {
        var emitter = new events.EventEmitter();
        engine.list().on('data', function (d) {
            console.log("ENGINE.LIST DATA");
            console.dir(d);

            for (var key in jobsArray) {
                var curr_job = jobsArray[key];
                if(curr_job.status === "CREATED"){
                    continue;
                }

                if (d.nameUUID.indexOf(key) === -1) { // if key is not found in listed jobs
                    curr_job.obj.MIA_jokers -= 1;
                    console.log('The job "' + key + '" missing from queue! Jokers left is ' +  curr_job.obj.MIA_jokers);
                    if (curr_job.obj.MIA_jokers === 0) {
                        var jobTmp = clone(curr_job); // deepcopy of the disappeared job
                        jobTmp.obj.emitter = curr_job.obj.emitter; // keep same emitter reference
                        delete jobsArray[key];
                    // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@")
                    // console.log(jobTmp);
                        jobTmp.obj.emitter.emit('lostJob', 'The job "' + key + '" is not in the queue !', jobTmp.obj);
                    }
                } else{
                    if (curr_job.obj.MIA_jokers < 3)
                        console.log('Job "' + key + '" found BACK ! Jokers count restored');

                    curr_job.obj.MIA_jokers = 3;
                }
            }
            //emitter.emit('');
        }).on('listError', function (err) {
            console.log('ERROR with engine list method :');
            console.log(err);
            emitter.emit('listError');
        });
        return emitter;
    },


    /**
    * Submit a job to manager,
    *
    * @param  {Object}JobSpecs
    * @return {EventEmitter} jobEmitter
    */
    push : function(jobProfileString, jobOpt) {
        console.log("jobProfile: " + jobProfileString + "\njobOpt:\n");
        console.log(jobOpt);
        var jobID = drawJobNumber();
        var self = this;
        /* Define the new job parameters */
        // We now expect an inputs parameter which has to be a list
        var jobTemplate = {
            "id" : jobID,
            "engineHeader" : engine.generateHeader(jobID, jobProfileString/*, jobOpt*/),
            "rootDir" : cacheDir,
            "emulated" : emulator ? true : false,
            "adress" : TCPip,
            "port" : TCPport,
            "submitBin" : engine.submitBin(),
            "script" : 'script' in jobOpt ? jobOpt.script : null,
            "cmd" : 'cmd' in jobOpt ? jobOpt.cmd : null,
            "inputs" : 'inputs' in jobOpt ? jobOpt.inputs : []
             };
        var newJob = jobLib.createJob(jobTemplate);

	    jobsArray[jobID] = { 'obj' : newJob, 'status' : 'CREATED' };
        self.jobsView();

        newJob.emitter.on('submitted', function(j){
            //console.log(j);
            jobsArray[j.id].status = 'SUBMITTED';
            self.jobsView();
        }).on('jobStart', function (job) {
            // next lines for tests on squeueReport() :
            // self.squeueReport().on('end', function (interface) {
            //     console.log(interface.matchPartition('ws-'));
            // });
        })

        exhaustBool = true;
        //console.log(jobsArray);

        return newJob.emitter;
    },
    /**
    * Starts the job manager
    *
    * @param  {Object}ManagerSpecs
    * @param {ManagerSpecs} cacheDir{String} Directory used for jobs caching
    * @param {ManagerSpecs} tcp{String} ip adress of the master node for netSocket
    * @param {ManagerSpecs} port{String} port number of the netSocket
    * @param {ManagerSpecs} slurmBinaries{String} path to slurm executable binaries
    * @return {String}
    */
    start : function(opt) {
        //console.log(opt)
        if (isStarted) return;
        var self = this;

        if (!opt) {
            throw "Options required to start manager : \"cacheDir\", \"tcp\", \"port\"";
        }
        cacheDir = opt.cacheDir + '/' + scheduler_id;
        TCPip = opt.tcp;
        TCPport = opt.port;
        jobProfiles = opt.jobProfiles;

/*      THIS SHOULD BE MOVED/DELETED
        if ('slurmBinaries' in opt) {
            sbatchPath = opt['slurmBinaries'] + '/sbatch';
            squeuePath = opt['slurmBinaries'] + '/squeue';
        }
*/
        if (opt.hasOwnProperty('forceCache')) {
            cacheDir = opt.forceCache;
        }

        if (opt.hasOwnProperty('probPreviousCacheDir')) {
            probPreviousCacheDir = opt.probPreviousCacheDir;
        }

        console.log("Attempting to create cache for process at " + cacheDir);
        try {
            fs.mkdirSync(cacheDir);
        } catch(e) {
            if ( e.code != 'EEXIST' ) throw e;
            console.log("Cache found already found at " + cacheDir);
        }

        console.log('[' + TCPip + '] opening socket at port ' + TCPport);
        var s = _openSocket(TCPport);
        data = '';
        s.on('listening',function(socket){
            eventEmitter.emit("ready");
            isStarted = true;
            console.log("Starting pulse monitoring");
            console.log("cache Directory is " + cacheDir);
            core = setInterval(function(){_pulse()},500);
            warden = setInterval(function() {self.jobWarden()}, 5000);

            /*socket.on('data', function (chunk) {
                data += chunk.toString();
                console.log(chunk.toString());
            })*/
        })
        .on('data', function(data){ // TO RESUME HERE
                _parseMessage(data);
            // parse job id

            // clean ref in arrayJob

            //raise the "finish" event in job.emit("finish");

        });

    },



    /**
    * Try to kill all sbatch jobs of this process,
    * by viewing the jobIds defined in nslurm,
    * and comparing them to the jobIds defined in slurm.
    * It needs to use the engine API .
    */
    stop : function(bean, tagTask) {
        var self = this;
        var emitter = new events.EventEmitter();

        // define squeue and scancel pathways
        /* THIS SHOULD BE MOVED / ERASED
        if ('slurmBinaries' in bean.managerSettings) {
            squeuePath = bean.managerSettings['slurmBinaries'] + '/squeue';
            scancelPath = bean.managerSettings['slurmBinaries'] + '/scancel';
        }
        */
        //console.log('Jobs of this process : ' + Object.keys(jobsArray));
        engine.listJobID.on('listError', function (data) {
            console.log('Error for squeue command : ' + data);
            emitter.emit('errSqueue');
        })
        .on('finished', function () {
            console.log('All jobs are already killed');
            emitter.emit('cleanExit');
        })
        .on('jobLeft', function (toKill) {

            // run scancel command
            console.log('Try to cancel the job ' + toKill);
            var exec_cmd = require('child_process').exec;
            exec_cmd(engine.cancelBin() + ' ' + toKill.join(' '), function (err, stdout, stderr) {
                if (err) {
                    console.log('Error for scancel command : ' + err);
                    emitter.emit('errScancel');
                    return;
                }
                console.log('End of trying to kill the jobs : ' + toKill);
                emitter.emit('exit');
            });
        });
        return emitter;
    },

    set_id : function (val){
        id = val
    },
    see_id : function() {
        console.log("id is " + id);
    },
    test : function(){
        const spawn = require('child_process').spawn;
        const ls = spawn('ls', ['-lh', '/data']);

        ls.stdout.on('data', function (data){
            console.log('stdout: ' + data );
        });

        ls.stderr.on('data', function (data) {
            console.log('stderr: ' + data );
        });

        ls.on('close', function(code) {
            console.log('child process exited with code ' + code);
        });
    },

    /**
    * Perform a squeue call,
    *
    * @param  {Object}JobSpecs
    * @return N/A
    */
    squeue: function(jobId) {
        console.log('trying')
        var spawn = require('child_process').spawn;
        var log = '';
        //var cmd = "ps";

        //var logger = spawn('ps', ['-aux']);
        var logger = spawn('squeue', []);
        logger.stdout.on('data',function(data){
            log += data.toString();
          //  console.log("some>> " + data);
        });
        logger.stderr.on('data',function(data){
            log += data.toString();
           // console.log("some>> " + data);
        });
        logger.on('close', function(){
            console.log('closing');
            console.log(log);
        });

    //return String("This is a squeue");
    }

};


// Private Module functions

function _parseMessage(string) {
    //console.log("trying to parse " + string);
    var re = /^JOB_STATUS[\s]+([\S]+)[\s]+([\S]+)$/
    var matches = string.match(re);
    if (! matches) return;

    var jid = matches[1];
    var uStatus = matches[2];
    if (!jobsArray.hasOwnProperty(jid)) {
        console.log('unregistred job id ' + jid);
        eventEmitter.emit('unregistredJob', jid);
        return;
        //throw 'unregistred job id ' + jid;
    }

    console.log('Status Updating [job ' + jid + ' ] : from \'' +
                jobsArray[jid].status  + '\' to \'' + uStatus + '\'');
    jobsArray[jid].status = uStatus;
    if (uStatus === 'START')
        jobsArray[jid].obj.emitter.emit('jobStart', jobsArray[jid].obj);
    else if (uStatus === "FINISHED")
        _pull(jid);
};

function _pull(jid) { //handling job termination
    console.log("Pulling " + jid);
    //console.dir(jobsArray[jid]);
    var jRef = jobsArray[jid];
    delete jobsArray[jid];
    var stdout = jRef.obj.stdout();
    var stderr = jRef.obj.stderr();
    jRef.obj.emit("completed",
       stdout, stderr, jRef.obj
    );
     // Does object persist ?
};


function _openSocket(port) {

    //var data = '';

    var server = net.createServer(function (socket) {
        socket.write('#####nSlurm scheduler socket####\r\n');
        socket.pipe(socket);
        socket.on('data', function(buf){
            //console.log("incoming data");
            //console.log(buf.toString());
            eventEmitter.emit('data', buf.toString());
        })
        .on('error', function(){
            // callback must be specified to trigger close event
        });

    });
    server.listen(port);

    server.on('error', function(e){
        console.log('error' + e);
        eventEmitter.emit('error', e);
    });
    server.on('listening', function(){
        console.log('Listening on ' + port + '...');
        eventEmitter.emit('listening');
    });
    server.on('connection', function(s){

        //console.log('connection w/ ' + data);
        s.on('close', function(){
          //  console.log('Packet connexion closed');
        });
        //console.dir(s);
        //ntEmitter.emit('success', server);
    });


    return eventEmitter;
}

function _openSocketDRPEC(fileName){
    var rstream = null;
    console.log("---> " + fileName);

    var eventEmitter = new events.EventEmitter();
    fs.stat(fileName, function(err, stat) {
        console.log("pouet");
        if(err == null) {
            console.log('File exists');
            rstream = fs.createReadStream(fileName);
            eventEmitter.emit('open', rstream);
        } else if(err.code == 'ENOENT') {
            console.log("creating file")
            fs.writeFile(fileName, 'Some log\n');
            rstream = fs.createReadStream(fileName);
            eventEmitter.emit('open', rstream);
        } else {
            eventEmitter.emit('error', err.code);
        }
    });
    return eventEmitter;
}

function _pulse(){
    var c = 0;
    for (var k in jobsArray) c++;
    if( c === 0 ) {
        if (exhaustBool) {
            eventEmitter.emit("exhausted");
            exhaustBool = false;
        }
    }
    //console.log("boum");
}
var job_template = {'name' : 'john Doe', 'runtime' : 'forever'};


