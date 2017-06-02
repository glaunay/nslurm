#!/bin/bash

# LOG AS ifbuser
# THEN sudo su

# GUESS THE PULBIC IP ADRESS ON OPEN STACK CLOUD
# curl http://169.254.169.254/latest/meta-data/public-ipv4


sudo yum -y install git
sudo yum -y install -y gcc-c++ make
curl -sL https://rpm.nodesource.com/setup_6.x | sudo -E bash -
sudo yum -y install nodejs


export CLUSTER_QUEUELIST_CMD=`which qstat`
export CLUSTER_QUEUESUB_CMD=`which qsub`
export CLUSTER_QUEUEDEL_CMD=`which qdel`

HOME_DIR=`pwd`
CACHE_DIR=$HOME_DIR/cacheDir
sudo chmod a+w $CACHE_DIR

PRIVATE_IP=`awk '$2 == "master" {print $1;exit}' /etc/hosts`

cat << EOF > $HOME_DIR/configuration.json
{
    "binaries" : {
        "cancelBin" : $CLUSTER_QUEUEDEL_CMD,
        "queueBin"  : $CLUSTER_QUEUELIST_CMD,
        "submitBin" : $CLUSTER_QUEUELIST_CMD
  },
  "cacheDir" : $CACHE_DIR,
  "port" : 5000,
  "tcp" : $PRIVATE_IP,
  "engineType" : "sge",
    "jobSettings" : {
        "user" : "ifbuser",
        "script" : "/home/ifbuser/dummyTask.sh"
  }
}
EOF

mkdir $CACHE_DIR

