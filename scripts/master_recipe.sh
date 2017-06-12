#!/bin/bash
source functions.sh
# LOG AS ifbuser
# THEN sudo su
# GUESS THE PULBIC IP ADRESS ON OPEN STACK CLOUD
# curl http://169.254.169.254/latest/meta-data/public-ipv4


while [[ $# -gt 1 ]]
do
key="$1"

case $key in
    #-e|--extension)
    #EXTENSION="$2"
    #shift # past argument
    #;;
    --master)
    MASTER_DEPLOY=YES
    ;;
    --slave)
    SLAVE_DEPLOY=YES
    ;;
    *)
            # unknown option
    ;;
esac
shift # past argument or value
done

[ test -z $MASTER_DEPLOY ] || masterDeploy

if ! test -z $SLAVE_DEPLOY;
    then
    ipAdr=getSlavesIPs
    slaveDeploy $ipAdr
fi

exit



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

