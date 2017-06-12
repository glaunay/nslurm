#!/bin/bash

function getSlavesIPs {
    awk '$2 ~ /slave/ {print $2}' | sort | uniq
}

function slaveDeploy {
    for ip in $1
        do
        ssh root@$ip 'yum -y install nc'
    done
}


function masterDeploy {
    sudo yum -y install git
    sudo yum -y install -y gcc-c++ make
    curl -sL https://rpm.nodesource.com/setup_6.x | sudo -E bash -
    sudo yum -y install nodejs
    sudo yum -y install nc

}


function setManager {

    export CLUSTER_QUEUELIST_CMD=`which qstat`
    export CLUSTER_QUEUESUB_CMD=`which qsub`
    export CLUSTER_QUEUEDEL_CMD=`which qdel`

    HOME_DIR=`pwd`
    CACHE_DIR=$HOME_DIR/cacheDir
    mkdir $CACHE_DIR


    PRIVATE_IP=`awk '$2 == "master" {print $1;exit}' /etc/hosts`



cat << EOF > $HOME_DIR/configuration.json
{
    "comments": "Automatically generated IFB-sge config file",
    "binaries" : {
        "cancelBin" : $CLUSTER_QUEUEDEL_CMD,
        "queueBin"  : $CLUSTER_QUEUELIST_CMD,
        "submitBin" : $CLUSTER_QUEUESUB_CMD
  },
  "cacheDir" : $CACHE_DIR,
  "port" : 5000,
  "tcp" : $PRIVATE_IP,
  "engineType" : "sge",
  "test": {
        "keyProfile": "ifb_basic",
        "jobSettings": {
            "cmd": "sleep 20;echo \"This is stdout of test job\"",
            "inputs": []
        }
    }
}
EOF

}
