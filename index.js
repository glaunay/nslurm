var fs = require('fs'); // file system
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

var debugMode = false;

/*****************
    jobManager events
'unregistredJob'
'ready'
'error'
'exhausted'
'listening'
'wardenError'
******************/
/**
* Set scheduler engine and emulation states
*
* @param  {Object}managerOptions: Litteral of options
* @return null
*/
var configure = function(opt) {
        console.log("\n\n############ENGINE CONFIGURATION OPTIONS############\n");
        console.dir(opt);
        console.log("\n####################################################\n");
        if (!opt.hasOwnProperty('engine')) throw ("Please specify a scheduler engine");
        if (opt.engine === "sge")
            engine = sgeLib;
        else if (opt.engine === "slurm")
            engine = slurmLib;
        else if (opt.engine === "emulator") {
            engine = emulatorLib;
            emulator = true;
        }
        if (opt.engine != "emulator") {
            if (!opt.hasOwnProperty('binaries')) throw "You must specify scheduler engine binaries";
        }
        engine.configure(opt.binaries, jobsArray);
        console.log("Engine configured is " + engine.type());
    }
/**
* Check the existence of the bare minimum set of parameters to configure an engine
*
* @param  {Object}managerOptions: Litteral of options
* @return null
*/
var _checkBinariesSpecs = function(opt) {
    var vKeys = ["cancelBin", "queueBin", "submitBin"];
    var msg = "Missing engine binaries parameters keys \"cancelBin\", \"queueBin\", \"submitBin\"";
    for (var k in vKeys)
        if (!opt.hasOwnProperty(k))
            throw (msg);
    engine.configure(opt);
}


/**
 * Draw a unique identifier for a job about to be created
 *
 * @param  None
 * @return {String}UUID
 */
var drawJobNumber = function() {
    return uuid.v4();
}

/**
 * Returns the set of current jobs in an Array
 *
 * @param  None
 * @return {Array}jobObjList : A list of job Objects
 */
var _getCurrentJobList = function() {
    var jobObjList = [];
    for (var key in jobsArray) {
        jobObjList.push(jobsArray[key].obj);
    }
    return jobObjList;
}
module.exports = {
    engine: function() {
        return engine;
    },
    emulate: function() {
        emulator = true;
    },
    isEmulated: function() {
        return emulator;
    },
    configure: configure,
    on: function(eventName, callback) { //
        eventEmitter.on(eventName, callback);
    },

    /**
     * Returns the manager cache directory
     *
     * @param  None
     * @return {String}cacheDirectory
     */
    cacheDir: function() {
        return cacheDir;
    },

    /* GL THIS TASK TAG occurences in this library may have to be reconsidered SEE MELANIE
     * For a list of directories, find task directories and return them.
     * TWO LEVELS OF RESEARCH :
     * 1/ a directory in the list can be a task directory -> check the name of the directory
     * 2/ or can contain task directories -> search inside the directory & check the sub-directory names
     *
     * TASK DIRECTORY CONVENTION :
     * The name of a task directory is composed of the task tag (exemple : "naccess")
     * with "Task_" and the unique id (uuid) and eventually a little string at the end (exemple : "_hex_25")
     */

    findTaskDir: function(tagTask) {
        if (!tagTask) throw 'ERROR : no tag task specified !';
        // convention of writing the task directory name
        var re_taskDir = tagTask + 'Task_[\\S]{8}-[\\S]{4}-[\\S]{4}-[\\S]{4}-[\\S]{12}_{0,1}[\\S]*';
        var re_inputDir = tagTask + 'Task_[\\S]{8}-[\\S]{4}-[\\S]{4}-[\\S]{4}-[\\S]{12}_inputs';
        var taskDirs = [];

        probPreviousCacheDir.map(function(dir) { // read the list of directories
            try {
                var files = fs.readdirSync(dir);
            } // read content of the task directory (3)
            catch (err) {
                console.log(err);
                return;
            }
            // LEVEL 1
            files.filter(function(file) {
                return file.match(re_taskDir); // check writing convention of the name
            }).filter(function(file) {
                return !file.match(re_inputDir); // not the input directories
            }).map(function(file) {
                return path.join(dir, file); // use full path
            }).filter(function(file) {
                return fs.statSync(file).isDirectory(); // only directories
            }).map(function(file) {
                return taskDirs.push(file);
            });

            files.map(function(file) {
                return path.join(dir, file);
            }).filter(function(file) {
                return fs.statSync(file).isDirectory();
            }).map(function(file) {
                // LEVEL 2
                return fs.readdirSync(file).filter(function(subFile) {
                    return subFile.match(re_taskDir); // check writing convention of the name
                }).filter(function(subFile) {
                    return !subFile.match(re_inputDir); // not the input directories
                }).map(function(subFile) {
                    return path.join(file, subFile); // use full path
                }).filter(function(subFile) {
                    return fs.statSync(subFile).isDirectory(); // only directories
                }).map(function(subFile) {
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

    /**
     * Display on console.log the current list of "pushed" jobs and their status
     *
     * @param  None
     * @return null
     */
    jobsView: function() {
        var displayString = '###############################\n' + '###### Current jobs pool ######\n' + '###############################\n';
        var c = 0;
        for (var key in jobsArray) {;
            c++;
            displayString += '# ' + key + ' : ' + jobsArray[key].status + '\n';
        }
        if (c === 0)
            displayString += '          EMPTY               \n';
        console.log(displayString);
        return null;

    },

    /*
     * Call the engine processes listing function
     * @param  None
     * @return {Object}Litteral storing process IDs, job  UUID, partition and status
     */
    queueReport: function() {
        return engine.queueReport;
    },


    /*
     * Check the existence of our jobs (present in jobsArray) in the engine processes list.
     * @param  None
     * @return {Object}jobObject
    */
    jobWarden: function() {
        engine.list().on('data', function(d) {
            for (var key in jobsArray) {
                var curr_job = jobsArray[key];
                if (curr_job.status === "CREATED") {
                    continue;
                }

                if (d.nameUUID.indexOf(key) === -1) { // if key is not found in listed jobs
                    curr_job.obj.MIA_jokers -= 1;
                    console.log('The job "' + key + '" missing from queue! Jokers left is ' + curr_job.obj.MIA_jokers);
                    if (curr_job.obj.MIA_jokers === 0) {
                        var jobTmp = clone(curr_job); // deepcopy of the disappeared job
                        jobTmp.obj.emitter = curr_job.obj.emitter; // keep same emitter reference
                        delete jobsArray[key];
                        jobTmp.obj.emitter.emit('lostJob', 'The job "' + key + '" is not in the queue !', jobTmp.obj);
                    }
                } else {
                    if (curr_job.obj.MIA_jokers < 3)
                        console.log('Job "' + key + '" found BACK ! Jokers count restored');

                    curr_job.obj.MIA_jokers = 3;
                }
            }
            //emitter.emit('');
        }).on('listError', function(err) {
            eventEmitter.emit("wardenError", err)
        });
    //    return emitter;
    },


    /**
     * Submit a job to manager,
     *
     * @param  {String}jobProfileString : a key refering to profile settings acknowledge by the engine
     * @param  {Object}jobOpt : a litteral describing parameters for this particular job instance
     * @return {EventEmitter}jobEmitter : emitter bound to the job
            the following events are exposed :
                scriptReadError
                scriptWriteError
                scriptSetPermissionError
     */
    push: function(jobProfileString, jobOpt) {
        /*console.log("jobProfile: " + jobProfileString + "\njobOpt:\n");
        console.log(jobOpt);*/
        var jobID = drawJobNumber();
        var self = this;
        /* Define the new job parameters */
        // We now expect an inputs parameter which has to be a list
        var workDir = cacheDir + '/' + jobID;
        var jobTemplate = {
            "debugMode" : debugMode,
            "id": jobID,
            "engineHeader": engine.generateHeader(jobID, jobProfileString, workDir),
            "workDir": workDir,
            "emulated": emulator ? true : false,
            "adress": TCPip,
            "port": TCPport,
            "submitBin": engine.submitBin(),
            "script": 'script' in jobOpt ? jobOpt.script : null,
            "cmd": 'cmd' in jobOpt ? jobOpt.cmd : null,
            "inputs": 'inputs' in jobOpt ? jobOpt.inputs : [],
            "exportVar" : 'exportVar' in jobOpt ? jobOpt.exportVar : null
        };
        var newJob = jobLib.createJob(jobTemplate);

        jobsArray[jobID] = {
            'obj': newJob,
            'status': 'CREATED'
        };
        if(debugMode)
            self.jobsView();

        newJob.emitter.on('submitted', function(j) {
            //console.log(j);
            jobsArray[j.id].status = 'SUBMITTED';
            if(debugMode)
                self.jobsView();
        }).on('jobStart', function(job) {
            // next lines for tests on squeueReport() :
            engine.list()
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
    start: function(opt) {
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

        if (opt.hasOwnProperty('forceCache')) {
            cacheDir = opt.forceCache;
        }

        if (opt.hasOwnProperty('probPreviousCacheDir')) {
            probPreviousCacheDir = opt.probPreviousCacheDir;
        }
        if(debugMode)
            console.log("Attempting to create cache for process at " + cacheDir);
        try {
            fs.mkdirSync(cacheDir);
        } catch (e) {
            if (e.code != 'EEXIST') throw e;
            console.log("Cache found already found at " + cacheDir);
        }
        if(debugMode)
            console.log('[' + TCPip + '] opening socket at port ' + TCPport);
        var s = _openSocket(TCPport);
        data = '';
        s.on('listening', function(socket) {
                isStarted = true;
                if(debugMode) {
                    console.log("Starting pulse monitoring");
                    console.log("cache Directory is " + cacheDir);
                }
                core = setInterval(function() {
                    _pulse()
                }, 500);
                warden = setInterval(function() {
                    self.jobWarden()
                }, 5000);

                console.log("       --->jobManager " + scheduler_id + " ready to process jobs<---\n\n");
                eventEmitter.emit("ready");
            })
            .on('data', _parseMessage);
    },



    /**
    * Try to kill all sbatch jobs of this process,
      exposes 4 events:
        'cleanExit' : all jobs were succesfully killed
        'leftExit'  : some jobs could not be killed
        'emptyExit' : no jobs  to kill
        'cancelError' : an error occur while killing
        'listError': an error occur  while listing processes corresponding to pending jobs
    */
    stop: function(bean, tagTask) {

        var jobObjList = _getCurrentJobList();
        var emitter = engine.kill(jobObjList);

        return emitter;
    },

    debugOn : function() {
        debugMode = true;
    },

    set_id: function(val) {
        id = val
    },
    see_id: function() {
        console.log("id is " + id);
    },

};

function _parseMessage(string) {
    //console.log("trying to parse " + string);
    var re = /^JOB_STATUS[\s]+([\S]+)[\s]+([\S]+)/
    var matches = string.match(re);
    if (!matches) return;

    var jid = matches[1];
    var uStatus = matches[2];
    if (!jobsArray.hasOwnProperty(jid)) {
        if(debugMode)
            console.log('unregistred job id ' + jid);
        eventEmitter.emit('unregistredJob', jid);
        return;
        //throw 'unregistred job id ' + jid;
    }
    if(debugMode)
        console.log('Status Updating [job ' + jid + ' ] : from \'' +
            jobsArray[jid].status + '\' to \'' + uStatus + '\'');
    jobsArray[jid].status = uStatus;
    if (uStatus === 'START')
        jobsArray[jid].obj.emitter.emit('jobStart', jobsArray[jid].obj);
    else if (uStatus === "FINISHED")
        _pull(jid);
};

function _pull(jid) { //handling job termination
    if(debugMode)
        console.log("Pulling " + jid);
    //console.dir(jobsArray[jid]);
    var jRef = jobsArray[jid];
    delete jobsArray[jid];
    var stdout = jRef.obj.stdout();
    var stderr = jRef.obj.stderr();
    jRef.obj.emit("completed",
        stdout, stderr, jRef.obj
    );
};


function _openSocket(port) {
    var eventEmitterSocket = new events.EventEmitter();
    //var data = '';

    var server = net.createServer(function(socket) {
        socket.write('#####nSlurm scheduler socket####\r\n');
        socket.pipe(socket);
        socket.on('data', function(buf) {
                //console.log("incoming data");
                //console.log(buf.toString());
                eventEmitterSocket.emit('data', buf.toString());
            })
            .on('error', function() {
                // callback must be specified to trigger close event
            });

    });
    server.listen(port); //, "127.0.0.1"

    server.on('error', function(e) {
        console.log('error' + e);
        eventEmitter.emit('error', e);
    });
    server.on('listening', function() {
        if(debugMode)
            console.log('Listening on ' + port + '...');
        eventEmitterSocket.emit('listening');
    });
    server.on('connection', function(s) {

        //console.log('connection w/ ' + data);
        s.on('close', function() {
            //  console.log('Packet connexion closed');
        });
        //console.dir(s);
        //ntEmitter.emit('success', server);
    });


    return eventEmitterSocket;
}

function _pulse() {
    var c = 0;
    for (var k in jobsArray) c++;
    if (c === 0) {
        if (exhaustBool) {
            eventEmitter.emit("exhausted");
            exhaustBool = false;
        }
    }
}
