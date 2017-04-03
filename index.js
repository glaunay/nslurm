var fs = require('fs');  // file system
var uuid = require('node-uuid');
var events = require('events');
var net = require('net');
var jobLib = require('./job');
var path = require('path');

var sbatchPath = 'sbatch';
var squeuePath = 'squeue';

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



/**
* List all the job ids of slurm that are both in this process and in the squeue command.
* Only used in the stop function.
* Warning : the ids or not listed in order.
*/
var _listSlurmJobID = function(tagTask) {
    var emitter = new events.EventEmitter();

    // run squeue command
    var exec_cmd = require('child_process').exec;
    exec_cmd(squeuePath + ' -o \"\%j \%i\"', function (err, stdout, stderr) {
        if (err) {
            emitter.emit('errSqueue', err);
            return;
        }
        // list of slurmIDs of the jobs to kill
        var toKill = new Array();

        // squeue results
        var squeueIDs = ('' + stdout).replace(/\"/g, '');
        // regex
        var reg_NslurmID = new RegExp ('^' + tagTask + 'Task_[\\S]{8}-[\\S]{4}-[\\S]{4}-[\\S]{4}-[\\S]{12}_{0,1}[\\S]*');
        var reg_slurmID = new RegExp ('[0-9]+$');
        //console.log(squeueIDs);

        // for each job in the squeue
        squeueIDs.split('\n').forEach (function (line) {
            // use the regex
            if (reg_NslurmID.test(line) && reg_slurmID.test(line)) {
                var NslurmID = reg_NslurmID.exec(line);
                var slurmID = reg_slurmID.exec(line);
                // in case we found NslurmID in the jobs of our process
                if (jobsArray.hasOwnProperty(NslurmID)) {
                    console.log('Job ' + slurmID + ' must be killed');
                    toKill.push(slurmID[0]);
                }
            }
        });
        if (toKill.length === 0) emitter.emit('finished');
        else emitter.emit('jobLeft', toKill);
    });
    return emitter;
}



/**
 * perform a squeue action
 *
 * @param  {String}JobID, optional
 * @return {String}
 */
module.exports = {
    /**
    * Expose the module emitter, mostly for signaling exhaustion of the job pool
    *
    * @param  {String}eventName, {Function}callback
    * @return N/A
    */
    emulate : function(){ emulator = true; },
    isEmulated : function(){ return emulator; },
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
    /**
    * Submit a job to manager,
    *
    * @param  {Object}JobSpecs
    * @return {EventEmitter} jobEmitter
    */
    push : function(jobOpt) {
        //console.log("jobOpt");
        //console.log(jobOpt);
        var self = this;
        // var partition, qos = null;
        // if (jobOpt.gid) {
        //     if (jobOpt.gid === "ws_users") {
        //         partition = 'ws-dev';
        //         qos = 'ws-dev';
        //     }
        // }
            //
        if (jobOpt.hasOwnProperty('generic') || jobOpt.hasOwnProperty('specific')) jobOpt = self.concatJson(jobOpt.generic,jobOpt.specific);

        var newJob = jobLib.createJob({
            'emulated' : emulator ? true : false,
            'id' : 'id' in jobOpt ? jobOpt.id : null,
            'cwd' : 'cwd' in jobOpt ? jobOpt.cwd : null,
            'cwdClone' : 'cwdClone' in jobOpt ? jobOpt.cwdClone : false,
            'sbatch' : sbatchPath,
            'rootDir' : cacheDir,
            'adress' : TCPip, 'port' : TCPport,
            'ttl' : 50000,
            'partition' : 'partition' in jobOpt ? jobOpt.partition : null,
            'qos' : 'qos' in  jobOpt ? jobOpt.qos : null,
            'cmd' : 'cmd' in jobOpt ? jobOpt.cmd : null,
            'script' : 'script' in jobOpt ? jobOpt.script : null,
            'exportVar' : 'exportVar' in jobOpt ? jobOpt.exportVar : null,
            'tWall' : 'tWall' in jobOpt ? jobOpt.tWall : null,
            'nNodes' : 'nNodes' in jobOpt ? jobOpt.nNodes : null,
            'nCores' : 'nCores' in jobOpt ? jobOpt.nCores : null,
            'modules' : 'modules' in jobOpt ? jobOpt.modules : null,
            'gres' : 'gres' in jobOpt ? jobOpt.gres : null
        });
	if ('gid' in jobOpt) newJob['gid'] = jobOpt.gid;
        if ('uid' in jobOpt) newJob['uid'] = jobOpt.uid;        

	jobsArray[newJob.id] = { 'obj' : newJob, 'status' : 'CREATED' };

        self.jobsView();

        newJob.emitter.on('submitted', function(j){
            jobsArray[j.id].status = 'SUBMITTED';
            self.jobsView();
        })

        exhaustBool = true;

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

        if (!opt) {
            throw "Options required to start manager : \"cacheDir\", \"tcp\", \"port\"";
        }
        cacheDir = opt.cacheDir + '/' + scheduler_id;
        TCPip = opt.tcp;
        TCPport = opt.port;
        jobProfiles = opt.jobProfiles;

        if ('slurmBinaries' in opt) {
            sbatchPath = opt['slurmBinaries'] + '/sbatch';
            squeuePath = opt['slurmBinaries'] + '/squeue';
        }

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
    * It needs to use the squeue and scancel commands.
    */
    stop : function(bean, tagTask) {
        var self = this;
        var emitter = new events.EventEmitter();

        // define squeue and scancel pathways
        if ('slurmBinaries' in bean.managerSettings) {
            squeuePath = bean.managerSettings['slurmBinaries'] + '/squeue';
            scancelPath = bean.managerSettings['slurmBinaries'] + '/scancel';
        }
        //console.log('Jobs of this process : ' + Object.keys(jobsArray));

        _listSlurmJobID(tagTask)
        .on('errSqueue', function (data) {
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
            exec_cmd(scancelPath + ' ' + toKill.join(' '), function (err, stdout, stderr) {
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
    if (uStatus === "FINISHED")
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


