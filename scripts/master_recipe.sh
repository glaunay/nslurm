#!/bin/bash

# LOG AS ifbuser
# THEN sudo su

# GUESS THE PULBIC IP ADRESS ON OPEN STACK CLOUD
# curl http://169.254.169.254/latest/meta-data/public-ipv4


sudo yum -y install git
sudo yum -y install -y gcc-c++ make
curl -sL https://rpm.nodesource.com/setup_6.x | sudo -E bash -
sudo yum -y install nodejs
sudo yum -y install nc

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

cat << EOF > $HOME_DIR/dummy.sh
ls
pwd -P
sleep 35
echo "Something"
EOF

cat << EOF > $HOME_DIR/dummy.qsub
#!/bin/bash
#
# LOG ERROR SCHEDULER located in
# /opt/sge/default/spool/
#$ -u ifbuser
#$ -wd /home/ifbuser/cacheDir
#$ -N dummy_name_long
#$ -o dummy.out
#$ -e dummy.err

ls
pwd -P
sleep 30
EOF

sudo chmod a+wrx $CACHE_DIR $HOME_DIR/dummy.qsub $HOME_DIR/dummy.sh $HOME_DIR/configuration.json

