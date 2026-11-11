#!/bin/bash

pathtocopy=$1

todir=$2

echo cp $pathtocopy $todir/$(echo $pathtocopy|sed 's/_out\///' | sed 's/\//-/g')
cp $pathtocopy $todir/$(echo $pathtocopy|sed 's/_out\///' | sed 's/\//-/g')
