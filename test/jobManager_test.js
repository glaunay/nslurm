/*var should = require('chai').should(),
    nSlurm = require('../index'),
    squeue = nSlurm.squeue,
    submit = nSlurm.squeue;

    */
/* qbatch;nc->sbatch->nc */

s = require('../index.js');


var cacheDir, port, tcp;
process.argv.forEach(function (val, index, array){
    /*if (val === '--local') bLocal = true;
    if (val === '--gpu') ardockFunc = PDB_Lib.arDock_gpu;
    */
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
});

s.start({ 'cacheDir' : cacheDir,
          'tcp' : tcp,
          'port' : port
      });
s.on('exhausted', function(){
        console.log("All jobs processed");
    });
