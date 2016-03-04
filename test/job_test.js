// This is test unit for job development
/*

emiter
If you open the standard REPL (typing node on your terminal) you can load a script as if you had typed it all in by hand using .load

$ node
> .load script.js

*/
jl = require("./job.js")
j  = jl.createJob({port : 2222, adress : '192.168.117.255'})
j.setUp({ cmd : null, partition : 'ws-dev', qos : 'ws-dev', uid : 'ws_ardock',
          gid : 'ws_users' });



/*
    for a web service, follwoing slurm sbatch parameters are required
    job = slurm.Job("compress-test", "ws_demo",  "ws_users",
            workdir = webServiceWorkDir + "/" + jobFolder)

    job.partition = "ws-dev"
    job.qos = "ws-dev"
    job.script = "source /etc/profile.d/modules_cluster.sh\n"
    job.script = job.script + "source /etc/profile.d/modules.sh\n"

*/