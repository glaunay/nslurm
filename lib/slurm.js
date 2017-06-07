/*
    Scheduler abstraction layer
    Engine=SLURM

    exposes

    dumper(jobObject) Returns a string
    watch : squeue
*/

// SINGLE SCOPE IMPLEMENTATION.
// require me in jobManager scope, pass me to job at creation

var cancelBinary = null;
var queueBinary = null;
var submitBinary = null;
var profiles = require('./slurm.json');

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

var getPreprocessorString =  function(id, profileKey) {
    if( !profiles.hasOwnProperty("definitions") ) {
         throw("\"profiles\" dictionary is badly formed, no \"definitions\" key");
    }
    if ( !profiles.definitions.hasOwnProperty(profileKey) ) {
        throw("\"" + profileKey + "\" is not a registred SLURM profile");
    }
    var string = _preprocessorDump(id, profiles.definitions[profileKey]);

    return string;
}

var preprocessorMapper = {
    nNodes : function (v) {
        return "#SBATCH -N " + v + " # Number of nodes, aka number of worker \n"
    },
    nCores : function (v) {
        return "#SBATCH -n " + v + " # number of task, ie core\n"
    },
    tWall : function (v) {
        return "SBATCH -t " + v + " # Runtime in D-HH:MM\n";
    },
    partition : function (v) {
        return "#SBATCH -p " + v + " # Partition to submit to\n";
    },
    qos : function (v) {
        return "#SBATCH --qos " + v + " # Partition to submit to\n";
    },
    gid : function (v) {
        return  "#SBATCH --gid " + v + "\n";
    },
    uid : function (v) {
        return "#SBATCH --uid " + v + "\n";
    },
    gres : function (v) {
        return "#SBATCH --gres=" + jobObject.gres + "\n";
    }

};

var preprocessorDump = function(id, preprocessorOpt) {
    var string = "#SBATCH -J " + id + "\n";
    string += "#SBATCH -o " + id + "\n";
    string += "#SBATCH -e " + id + "\n";
    for (var opt in preprocessorOpt) {
        if (! mapper.hasOwnProperty(opt)) {
            console.warn("\"" + key + "\" is not known profile parameters\"");
            continue;
        }
        string += preprocessorMapper[opt](preprocessorOpt[opt]);
    }

    if (preprocessorOpt.hasOwnProperty("qos")) {
        if (["ws-dev", "gpu", "ws-prod"].includes(preprocessorOpt.qos) )
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

}


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
            emitter.emit('listError', err);
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



/*
* Realize an asynchronous squeue command on slurm according a parameter (or not).
* Results are then filtered to keep only jobs contained in our jobsArray{}.
* Finally, datas are formated into a literal.
* @paramSqueue {string} optional. For example : ' -o "%j %i" ' // not implemented yet
*/
var _squeue = function(paramSqueue) {
    if (! paramSqueue) paramSqueue = '';
    paramSqueue = ''; // to remove when it will be take into account in the implementation
    var emitter = new events.EventEmitter();
    var squeueRes_dict = {
        'id' : [],
        'partition' : [],
        'nameUUID' : [],
        'status' : []
    }

    // squeue command
    var exec_cmd = require('child_process').exec;
    exec_cmd(squeuePath + '  -o \"\%i \%P \%j \%t\" ' + paramSqueue, function (err, stdout, stderr) {
        if (err){
            emitter.emit('listError', err);
            return;
        }

        var squeueRes_str = ('' + stdout).replace(/\"/g, ''); // squeue results
        squeueRes_str.split('\n')
        .map(function (jobLine, i) { // for each job
            return test = jobLine.split(' ').filter(function (val) {
                return val != ''; // keep values that are not empty
            });
        })
        .filter(function (jobArray) {
            return jobsArray.hasOwnProperty(jobArray[2]); // keep jobs of our jobsArray
        })
        .map(function (jobArray, i) { // save each field in the corresponding array of dict
            squeueRes_dict.id.push(jobArray[0]); // job ID gived by slurm
            squeueRes_dict.partition.push(jobArray[1]); // gpu, cpu, etc.
            squeueRes_dict.nameUUID.push(jobArray[2]); // unique job ID gived by Nslurm (uuid)
            squeueRes_dict.status.push(jobArray[3]); // P, R, CF, CG, etc.
        });
        emitter.emit('data', squeueRes_dict);
    });
    return emitter;
}




var squeueReport = function() {
    var emitter = new events.EventEmitter();
    var squeueRes;
    _squeue().on('data', function(d) {
         // to return with the event 'end' :
         var interface = {
             data: d,

                 /*
                  * Search for all jobs running on a given @partition
                  * @partition must be the name of a partition or a part of the name
                  * (match method is used instead of ===)
                  */
                 matchPartition: function(partition) {
                     var self = this;
                     var results = {
                         'id': [],
                         'partition': [],
                         'nameUUID': [],
                         'status': []
                     };
                     self.data.partition.map(function(val, i) { // for each partition
                         if (val.match(partition)) { // if the job is on @partition
                             for (var key in self.data) { // keep all the {'key':'value'} corresponding
                                 results[key].push(self.data[key][i]);
                             }
                         }
                     });
                     return results;
                 }
         };
         emitter.emit('end', interface);
     }).on('listError', function(err) {
         console.log('ERROR with _squeue() method in nslurm : ');
         console.log(err);
         emitter.emit('errSqueue');
     });
     return emitter;
 }
module.exports = {
    configure : function(opt) {
        if (opt.hasOwnProperty("cancelBin"))
            cancelBinary = opt["cancelBin"];
        if (opt.hasOwnProperty("queueBin"))
            queueBinary = opt["queueBin"];
        if (opt.hasOwnProperty("submitBin"))
            submitBinary = opt["submitBin"];
    },
    watch : function(){

    },
    generateHeader : getPreprocessorString ,
    list : _squeue,
    dumper : dumper,
    queueReport : squeueReport,
    listJobID : _listSlurmJobID,
    cancelBin : function() { return cancelBinary;},
    submitBin : function() { return submitBinary;},
    type : function() {return 'slurm';}
};

