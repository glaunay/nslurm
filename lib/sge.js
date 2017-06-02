//var xmlParse = require('xml-parser');
var xmlParseString = require('xml2js').parseString;
var events = require('events');
var inspect = require('util').inspect;

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

var jobsArray = null;

var qstatFormat = function (qstatRaw) {
    //qstat -xml | tr '\n' ' ' | sed 's#<job_list[^>]*>#\n#g' \
  //| sed 's#<[^>]*>##g' | grep " " | column -t
    var data = qstatRaw.replace(/\n/g,'').replace(/<job_list[^>]*>/g, "$&\n")
                    .replace(/<[^>]*>/g,'').replace(/^\s*\n/gm, "")
                    .replace(/^[\s]*/gm,"").replace(/[\s]*\n/gm,"\n").split("\n");
    return data.map(function(e){return e.replace(/[\s]*$/g,'').split(/[\s]+/);});
}

/*
#$ -u ifbuser
#$ -wd /home/ifbuser/cacheDir
#$ -N dummy_name_long
#$ -o dummy.out
#$ -e dummy.err
*/


var dumper = function(jobObject) {
    string += "#$ -N " + jobObject.id + "\n";

    var stdout = jobObject.hasOwnProperty('out') ? jobObject.out : jobObject.id + ".out";
    string += "#$ -o " + stdout + "\n";
    var stderr = jobObject.hasOwnProperty('err') ? jobObject.err : jobObject.id + ".err";
    string += "#$ -e " + stderr + "\n";

    if (jobObject.hasOwnProperty('uid')) {
        string += "#? -u " + jobObject.uid + "\n";
    }
    /*if (jobObject.hasOwnProperty('gid')) {
        string += "#SBATCH --gid " + jobObject.gid + "\n";
    }*/
      /*var nNodes = jobObject.hasOwnProperty('nNodes') ? jobObject.nNodes ? jobObject.nNodes : 1 : 1;
    string += "#SBATCH -N " + nNodes + " # Number of nodes, aka number of worker \n"
    var nCores = jobObject.hasOwnProperty('nCores') ? jobObject.nCores ? jobObject.nCores : 1 : 1;
    string += "#SBATCH -n " + nCores + " # number of task, ie core\n"
    */
    /*
    var tWall = jobObject.hasOwnProperty('tWall') ? jobObject.tWall ? jobObject.tWall : '0-00:05' : '0-00:05';
    string += "#SBATCH -t " + tWall + " # Runtime in D-HH:MM\n";
    var qos = jobObject.hasOwnProperty('qos') ? jobObject.qos : 'mobi-express';
    var partition = jobObject.hasOwnProperty('partition') ? jobObject.partition : 'mobi-express';
    string += "#SBATCH -p " + partition + " # Partition to submit to\n" + "#SBATCH --qos " + qos + " # Partition to submit to\n";
    */
    /*
    if (jobObject.gres != null) {
        string += "#SBATCH --gres=" + jobObject.gres + "\n";
    }
    */

  /*  if (qos === "ws-dev" || qos === "gpu" || qos === "ws-prod") { // NEW condition for GPU TODO
        string += "source /etc/profile.d/modules_cluster.sh\n";
        string += "source /etc/profile.d/modules.sh\n";
    }*/

    // NEW to load the modules
   /* jobObject.modules.forEach(function(e) {
        string += "module load " + e + '\n';
    });
    */
}


/**  A REECRIRE
* List all the job ids of slurm that are both in this process and in the squeue command.
* Only used in the stop function.
* Warning : the ids or not listed in order.
*/
var _listSlurmJobID = function(tagTask) {
    var emitter = new events.EventEmitter();
    console.log("SGE job Listing");
    // run squeue command
    var exec_cmd = require('child_process').exec;
    exec_cmd(queueBinary + ' -f', function (err, stdout, stderr) {
        if (err) {
            emitter.emit('listError', err);
            return;
        }
        console.log(stdout);
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

var createJobTemplate = function(jobOpt) {
    return {
            'batch' : submitBinary,
            'id' : 'id' in jobOpt ? jobOpt.id : null,
            'uid' : 'uid' in jobOpt ? jobOpt.uid : null,
            /*'cwd' : 'cwd' in jobOpt ? jobOpt.cwd : null,
            'cwdClone' : 'cwdClone' in jobOpt ? jobOpt.cwdClone : false,*/
            'cmd' : 'cmd' in jobOpt ? jobOpt.cmd : null,
            'script' : 'script' in jobOpt ? jobOpt.script : null,
            'exportVar' : 'exportVar' in jobOpt ? jobOpt.exportVar : null,
            /*
            'nNodes' : 'nNodes' in jobOpt ? jobOpt.nNodes : null,
            'nCores' : 'nCores' in jobOpt ? jobOpt.nCores : null,
            'modules' : 'modules' in jobOpt ? jobOpt.modules : null,
            */
            };
}


/*
* Realize an asynchronous squeue command on slurm according a parameter (or not).
* Results are then filtered to keep only jobs contained in our jobsArray{}.
* Finally, datas are formated into a literal.
* @paramSqueue {string} optional. For example : ' -o "%j %i" ' // not implemented yet
*/
var _qstat = function(qstatParam) {

    console.log("---->DING<----");

    if (! qstatParam) qstatParam = '';
    qstatParam = ''; // to remove when it will be take into account in the implementation
    var emitter = new events.EventEmitter();
    var qsubRes_dict = {
        'id' : [],
        'partition' : [],
        'nameUUID' : [],
        'status' : []
    }

    // squeue command
    var exec_cmd = require('child_process').exec;
    var cmd = queueBinary + ' -xml ';

    exec_cmd(cmd, function (err, stdout, stderr) {
        if (err){
            console.log("qstat error");
            emitter.emit('listError', err);
            return;
        }
        qstatFormat(stdout).forEach(function(e,i) {
            qsubRes_dict.id.push(e[0]); // job ID gived by slurm
            qsubRes_dict.partition.push(e[6]); // gpu, cpu, etc.
            qsubRes_dict.nameUUID.push(e[2]); // unique job ID gived by Nslurm (uuid)
            qsubRes_dict.status.push(e[4]); // P, R, CF, CG, etc.
        });
        emitter.emit('data', qsubRes_dict);
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
    configure : function(opt, jobsArrayRef) {
        //jobsArray = jobsArrayRef;

        console.log("configuring engine binaries");
        if (opt.hasOwnProperty("cancelBin"))
            cancelBinary = opt["cancelBin"];
        if (opt.hasOwnProperty("queueBin"))
            queueBinary = opt["queueBin"];
        if (opt.hasOwnProperty("submitBin"))
            submitBinary = opt["submitBin"];
        console.log("SGE Binaries set to ::\ncancel : " + cancelBinary + '\nqueue : ' + queueBinary + '\nsubmit : ' + submitBinary);
    },
    watch__ : function(){

    },
    createJobTemplate : createJobTemplate,
    list : _qstat,
    dumper : dumper,
    queueReport : squeueReport,
    listJobID : _listSlurmJobID,
    cancelBin : function() { return cancelBinary;},
    type : function () {return 'sge';}
};

