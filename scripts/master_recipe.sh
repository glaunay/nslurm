#!/bin/bash

sudo yum -y install git
sudo yum -y install gcc-c++ make
curl -sL https://rpm.nodesource.com/setup_6.x | sudo -E bash -
sudo yum -y install nodejs
sudo yum -y install nc
sudo npm install -g typescript


