sleep 2

var1=`cat $fileInputSymbol`
var2=`cat $streamInputSymbol`
var3=`cat $stringInputSymbol`
var4=`cat $anInput`

echo "{ \"content\" : \"$var1-----------$var2-----------$var3-----------$var4\"}"

sleep 2
