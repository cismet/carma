#!/bin/bash


#rm -rf pictmpdir

function limiter {
   while [ `jobs | wc -l` -ge 30 ]
   do
      sleep 1
   done
}



function theEnd {
   while [ `jobs | wc -l` -ge 2 ]
   do

      echo `jobs | wc -l` processes still running
      sleep 15
   done
}


#src dir 
srcfolder=$1

#target dir
targetdir=$2

pictmpdir=$3

i=0;
pids[0]=-1;


##find $srcfolder -name *913*FNP*.pdf  -print0 |

IFSbkp="$IFS"
IFS=$'\n'
counter=1;
FilesFound=$(find $srcfolder -name *.pdf )
for file in $FilesFound; do
    #echo "processing ${counter}/${sum}: ${file}"
    let counter++;
done

let sum=$counter-1;
echo Found $sum files.


counter=1;
for file in $FilesFound; do
    #echo "processing ${counter}/${sum}: ${file}"
    let counter++;
    pdf=${file}
    srcpath=$(dirname "${pdf}")
    srcfolderwithescapedslashes=$(echo $srcfolder|sed 's/\//\\\//g')
    targetpath=$targetdir/$(echo $pdf |sed "s/$srcfolderwithescapedslashes//")
    #mkdir -p $targetpath
    #echo $targetpath| sed "s/ü/ue/"
    correctedfilename=$(echo $targetpath | sed "s/ /_/g; s/$(echo -ne 'a\u0308')/ae/g; s/$(echo -ne 'A\u0308')/AE/g; s/$(echo -ne 'u\u0308')/ue/g; s/$(echo -ne 'U\u0308')/UE/g; s/$(echo -ne 'o\u0308')/oe/g; s/$(echo -ne 'O\u0308')/OE/g; s/ä/ae/g; s/ü/ue/g; s/ö/oe/g;  s/Ä/AE/g; s/Ö/OE/g; s/Ü/UE/g; s/ß/ss/g;")
    # echo
    echo "c2t.sh $pdf $correctedfilename" "$pictmpdir"
    # echo
    # ./c2t.sh "$pdf" "$correctedfilename"
    #limiter; ./src/c2t.sh "$pdf" "$correctedfilename" "$pictmpdir" &
    # pids[${i}]=$! 
    # echo ${pids[*]}
    # let "i++"
    # ps --ppid $$
done 
IFS="$IFSbkp"

theEnd

wait

echo fertich
 
