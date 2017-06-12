/*
    Scheduler abstraction layer for slurm cluster architecture

        engineLayer API contract ::

    engine.list :
        List process running in the engine
        @param None
        @return {Object}jobStatus litteral

        jobStatus litteral Object
        {
            'id' : [],
            'partition' : [],
            'nameUUID' : [],
            'status' : []
        }

    engine.generateHeader :
        Generates the preprocessor instruction required by the engine for any job.
        @param None
        @return {String}job script header lines.

    engine.type :
        Display the type of the engine
        @param None
        @return {String}

    engine.configure :
        Initialize the settings of the engine.
        @param {Object}
        @return null

    engine.submitBin :
        Reference to the execution binary of the engine, it is effectively passed to a job object.
        @param null
        @return {Function}

    engine.kill :
        Terminate processes associated with provided jobs
        @param {Array}List of jobObjects
        @return {Emitter} The following events are exposed
                'cleanExit', noArgs :  all pending jobs were killed
                'leftExit', {Int} nJobs:  number of job left pending");
                'emptyExit', noArgs : No job were to be killed
                'cancelError', {String} message : An error occured during job cancelation
                'listError', {String} message : An error occured during joblisting"
*/

var cancelBinary = null;
var queueBinary = null;
var submitBinary = null;
var childProcess = require('child_process');
var profiles = require('./slurmProfiles.json');
var events = require('events');

//var registredOpt
/*
var createJob({
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
        })
*/

//ADD THIS TO HEADER
//if (job.cwd && job.cloneCwd)
//        string += "cp -rf " + job.cwd + ' $WORKDIR';

var getPreprocessorString = function(id, profileKey) {
    if (!profiles.hasOwnProperty("definitions")) {
        throw ("\"profiles\" dictionary is badly formed, no \"definitions\" key");
    }
    if (!profiles.definitions.hasOwnProperty(profileKey)) {
        throw ("\"" + profileKey + "\" is not a registred SLURM profile");
    }
    var string = _preprocessorDump(id, profiles.definitions[profileKey]);
    return string;
}

var preprocessorMapper = {
    nNodes: function(v) {
        return "#SBATCH -N " + v + " # Number of nodes, aka number of worker \n"
    },
    nCores: function(v) {
        return "#SBATCH -n " + v + " # number of task, ie core\n"
    },
    tWall: function(v) {
        return "SBATCH -t " + v + " # Runtime in D-HH:MM\n";
    },
    partition: function(v) {
        return "#SBATCH -p " + v + " # Partition to submit to\n";
    },
    qos: function(v) {
        return "#SBATCH --qos " + v + " # Partition to submit to\n";
    },
    gid: function(v) {
        return "#SBATCH --gid " + v + "\n";
    },
    uid: function(v) {
        return "#SBATCH --uid " + v + "\n";
    },
    gres: function(v) {
        return "#SBATCH --gres=" + jobObject.gres + "\n";
    }

};

var _preprocessorDump = function(id, preprocessorOpt) {
    var string = "#SBATCH -J " + id + "\n";
    string += "#SBATCH -o " + id + ".out\n";
    string += "#SBATCH -e " + id + ".err\n";
    for (var opt in preprocessorOpt) {
        if (!preprocessorMapper.hasOwnProperty(opt)) {
            console.warn("\"" + opt + "\" is not known profile parameters\"");
            continue;
        }
        string += preprocessorMapper[opt](preprocessorOpt[opt]);
    }

    if (preprocessorOpt.hasOwnProperty("qos")) {
        if (["ws-dev", "gpu", "ws-prod"].includes(preprocessorOpt.qos))
            string += "source /etc/profile.d/modules_cluster.sh\n";
        string += "source /etc/profile.d/modules.sh\n";
    }


    /*
    var nNodes = jobObject.hasOwnProperty('nNodes') ? jobObject.nNodes ? jobObject.nNodes : 1 : 1;
    string += "#SBATCH -N " + nNodes + " # Number of nodes, aka number of worker \n"
    var nCores = jobObject.hasOwnProperty('nCores') ? jobObject.nCores ? jobObject.nCores : 1 : 1;
    string += "#SBATCH -n " + nCores + " # number of task, ie core\n"

    var tWall = jobObject.hasOwnProperty('tWall') ? jobObject.tWall ? jobObject.tWall : '0-00:05' : '0-00:05';
    string += "#SBATCH -t " + tWall + " # Runtime in D-HH:MM\n";
    var qos = jobObject.hasOwnProperty('qos') ? jobObject.qos : 'mobi-express';
    var partition = jobObject.hasOwnProperty('partition') ? jobObject.partition : 'mobi-express';
    string += "#SBATCH -p " + partition + " # Partition to submit to\n" + "#SBATCH --qos " + qos + " # Partition to submit to\n";

    if (jobObject.hasOwnProperty('gid')) {
        string += "#SBATCH --gid " + jobObject.gid + "\n";
    }
    if (jobObject.hasOwnProperty('uid')) {
        string += "#SBATCH --uid " + jobObject.uid + "\n";
    }
    if (jobObject.gres != null) {
        string += "#SBATCH --gres=" + jobObject.gres + "\n";
    }
*/


    // NEW to load the modules
    return string;
}

/*
'cleanExit', noArgs :  all pending jobs were killed
                'leftExit', {Int} nJobs:  number of job left pending");
                'emptyExit', noArgs : No job were to be killed
                'cancelError', {String} message : An error occured during job cancelation
                'listError', {String} message : An error occured during joblisting"
*/
var killJobs = function(jobObjList) {
    var emitter = new events.EventEmitter();

    var targetJobID = jobObjList.map(function(jobObj) {
        return jobObj.id;
    })
    console.log("Potential pending target job ids are:");
    console.dir(targetJobID);

    var targetProcess = [];
    _squeue()
        .on('listError', function(err) {
            emitter.emit('listError', err);
        })
        .on('data', function(squeueLookupDict) {
            squeueLookupDict.nameUUID.forEach(function(uuid, i) {
                if (targetJobID.indexOf(uuid) >= 0)
                    targetProcess.push(squeueLookupDict.id[i]);
            });
            _kill(targetProcess, emitter);
        });

    return emitter;
}

var _kill = function(processIDs, emitter) {
    var exec_cmd = childProcess.exec;
    if (processIDs.length == 0) {
        emitter.emit('emptyExit');
        return;
    }
    exec_cmd(cancelBinary + ' ' + processIDs.join(' '), function(err, stdout, stderr) {
        if (err) {
            emitter.emit('cancelError', err);
            return;
        }
        //final recount
        setTimeout(function() {
            _squeue().on('data', function(squeueLookupDict) {
                var nLeft = 0;
                squeueLookupDict.id.forEach(function(pid, i) {
                    if (processIDs.indexOf(pid) >= 0)
                        nLeft++;
                });
                if (nLeft == 0)
                    emitter.emit('cleanExit');
                else
                    emitter.emit('leftExit', nLeft);

            });
        }, 2000);
    });
}

/*
 * Realize an asynchronous squeue command on slurm according a parameter (or not).
 * Data are formated into a literal.
 * @paramSqueue {string} optional. For example : ' -o "%j %i" ' // not implemented yet
 */
var _squeue = function(paramSqueue) {
    if (!paramSqueue) paramSqueue = '';
    paramSqueue = ''; // to remove when it will be take into account in the implementation
    var emitter = new events.EventEmitter();
    var squeueRes_dict = {
        'id': [],
        'partition': [],
        'nameUUID': [],
        'status': []
    }

    // squeue command
    var exec_cmd = require('child_process').exec;
    exec_cmd(queueBinary + '  -o \"\%i \%P \%j \%t\" ' + paramSqueue, function(err, stdout, stderr) {
        if (err) {
            emitter.emit('listError', err);
            return;
        }
        var squeueRes_str = ('' + stdout).replace(/\"/g, ''); // squeue results
        squeueRes_str.split('\n')
            .filter(function(jobArray, i) {
                return jobArray.length > 0 && i > 0;
            })
            .map(function(jobLine, i) { // for each job
                return test = jobLine.split(' ').filter(function(val) {
                    return val != ''; // keep values that are not empty
                });
            })
            .map(function(jobArray, i) { // save each field in the corresponding array of dict
                squeueRes_dict.id.push(jobArray[0]); // job ID gived by slurm
                squeueRes_dict.partition.push(jobArray[1]); // gpu, cpu, etc.
                squeueRes_dict.nameUUID.push(jobArray[2]); // unique job ID gived by Nslurm (uuid)
                squeueRes_dict.status.push(jobArray[3]); // P, R, CF, CG, etc.
            });
        emitter.emit('data', squeueRes_dict);
    });
    return emitter;
}

module.exports = {
    configure: function(opt) {
        if (opt.hasOwnProperty("cancelBin"))
            cancelBinary = opt["cancelBin"];
        if (opt.hasOwnProperty("queueBin"))
            queueBinary = opt["queueBin"];
        if (opt.hasOwnProperty("submitBin"))
            submitBinary = opt["submitBin"];
    },
    generateHeader: getPreprocessorString,
    list: _squeue,
    cancelBin: function() {
        return cancelBinary;
    },
    submitBin: function() {
        return submitBinary;
    },
    type: function() {
        return 'slurm';
    },
    kill: killJobs
};