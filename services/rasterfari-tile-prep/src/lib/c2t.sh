#!/bin/bash



#src dir 
srcpdf=$1

#target dir
targetpath=$2
 

tmppath=$(dirname "pictmpdir/$targetpath")
mkdir -p "$tmppath"

 #exec 1>>out.log
 #exec 2>>out.log

dqt='"'
correctedtargetpath=$(echo $targetpath | sed "s/ /_/g; s/$(echo -ne 'a\u0308')/ae/g; s/$(echo -ne 'A\u0308')/AE/g; s/$(echo -ne 'u\u0308')/ue/g; s/$(echo -ne 'U\u0308')/UE/g; s/$(echo -ne 'o\u0308')/oe/g; s/$(echo -ne 'O\u0308')/OE/g; s/ä/ae/g; s/ü/ue/g; s/ö/oe/g;  s/Ä/AE/g; s/Ö/OE/g; s/Ü/UE/g; s/ß/ss/g;")

jpg=pictmpdir/$correctedtargetpath.jpg

function singlePageConvert {
    echo convert """$1""" $2 
    convert -density 300 -background white -alpha remove -quality 100 """$1""" $2 
    if [ $? == 1 ]; then
        echo imagemagick convert did not work. repair with gs then try again with poppler
        gs -o $2.pdf -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress """$1"""
        pdftoppm $2.pdf | pnmtojpeg -quality 100 > $2
    fi
}
function multiPageConvert {
    echo convert -density 300 -background white -alpha remove -quality 100 """$1""" $2 
    convert -density 300 -background white -alpha remove -quality 100 """$1""" $2 
    if [ $? == 1 ]; then
        echo imagemagick convert did not work. repair with gs then try again with poppler
        gs -o $2.pdf -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress """$1"""
        pdftoppm $2.pdf | pnmtojpeg -quality 100 > $2
    fi
}

pdfpages=$(pdfinfo "$srcpdf" | grep -a ^Pages | awk '{print $2}')
#echo "$pdfpages"
if [ "$pdfpages" -eq "$pdfpages" ]; then
   echo nop > /dev/null
else
    echo Problem with pfinfo $srcpdf >> pdfinforerror.txt
fi

if [ "$pdfpages" -gt "1" ]; then
    countJpgs=$(ls -1 pictmpdir/$correctedtargetpath* 2>/dev/null| wc -l)
    #echo countJpgs "pictmpdir/$correctedtargetpath*" = $countJpgs =?= $pdfpages
    if [ "$pdfpages" -ne "$countJpgs" ]; then
        multiPageConvert """$srcpdf""" $jpg 
    fi
else
    ## check if file exists
    if [ ! -f $jpg ]; then
        echo SinglePage: $jpg does not exist >> missing.txt
        singlePageConvert """$srcpdf""" $jpg 
    fi
fi



if [ "$pdfpages" -gt "1" ]; then
    #multiple pages
    pageCounter=0
    mkdir -p "$targetpath"
    echo "{" > $targetpath/meta.json
    for picpath in pictmpdir/$targetpath-*.jpg
        do
            target=$(echo $picpath| sed "s/^pictmpdir\///" | sed "s/\.jpg//g")
            correctedfilename=$(echo $target | sed "s/ /_/g; s/$(echo -ne 'a\u0308')/ae/g; s/$(echo -ne 'A\u0308')/AE/g; s/$(echo -ne 'u\u0308')/ue/g; s/$(echo -ne 'U\u0308')/UE/g; s/$(echo -ne 'o\u0308')/oe/g; s/$(echo -ne 'O\u0308')/OE/g; s/ä/ae/g; s/ü/ue/g; s/ö/oe/g;  s/Ä/AE/g; s/Ö/OE/g; s/Ü/UE/g; s/ß/ss/g;")
            #--processes=36 
            #gdal2tiles.py -p raster --resume -w none -q "$picpath" $correctedfilename
            if [ ! -d $correctedfilename ]; then
                gdal2tiles_ll.py -l -p raster --resume -w none "$picpath" $correctedfilename #> /dev/null 2>&1
            else 
                maxZoom=$(ls -1d $correctedfilename/*/ 2>/dev/null| awk -F "/" "{print \$(NF-1)}" | awk -F "/" "{print \$(NF-1)}" | sort -nr | head -n1)
                echo $correctedfilename exists with $maxZoom Zoomlevels
                echo $correctedfilename >> _internal/ok.txt
            fi
            sizes=$(identify -ping -format '"x":%[w], "y":%[h]' $picpath)
            sizesjson=$dqt$(echo size)$dqt:$sizes
            maxZoom=$(ls -1d $correctedfilename/*/ 2>/dev/null| awk -F "/" "{print \$(NF-1)}" | awk -F "/" "{print \$(NF-1)}" | sort -nr | head -n1)
            maxZoomJson=$(echo $dqt$(echo maxZoom)$dqt: $(echo $maxZoom))
            pageIndex=$(echo $correctedfilename |  awk -F- '{print $NF}')
            echo $dqt$(echo layer$pageIndex)$dqt: { $(echo $sizes), $(echo $maxZoomJson)  }, >> $targetpath/meta.json
            let pageCounter++
    done
    pagesjson=$dqt$(echo pages)$dqt:$pageCounter, 
    echo $pagesjson >> $targetpath/meta.json 
    echo $dqt$(echo _theend)$dqt: 0} >> $targetpath/meta.json
else
    #single page
    #gdal2tiles.py -p raster --resume -w none -q $jpg $targetpath
    if [ ! -d $targetpath ]; then
        gdal2tiles_ll.py -l -p raster --resume -w none  $jpg $targetpath #> /dev/null 2>&1
    else
        maxZoom=$(ls -1d $targetpath/*/ 2>/dev/null| awk -F "/" "{print \$(NF-1)}" | awk -F "/" "{print \$(NF-1)}" | sort -nr | head -n1)
        echo $targetpath exists with $maxZoom Zoomlevels
    fi
    pageCounter=1
    sizes=$(identify -ping -format '"x":%[w], "y":%[h]' $jpg)
    sizesjson=$dqt$(echo size)$dqt:$sizes
    echo "{" > $targetpath/meta.json
    maxZoom=$(ls -1d $targetpath/*/ 2>/dev/null| awk -F "/" "{print \$(NF-1)}" | awk -F "/" "{print \$(NF-1)}" | sort -nr | head -n1)
    maxZoomJson=$(echo $dqt$(echo maxZoom)$dqt: $(echo $maxZoom))
    echo $dqt$(echo layer0)$dqt: { $(echo $sizes), $(echo $maxZoomJson)  }, >> $targetpath/meta.json
    pagesjson=$dqt$(echo pages)$dqt:$pageCounter, 
    echo $pagesjson >> $targetpath/meta.json 
    echo $dqt$(echo _theend)$dqt: 0} >> $targetpath/meta.json
fi

