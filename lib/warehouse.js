/*
    Setters:
    indexing
    update upon jobs completion

    Getter :
    getWorkDir(constraints)

*/
var path = require('path');
var glob = require('glob');
var processArray = [];
var accessorArray = []
var debugMode = false;
var deepEqual = require('deep-equal');

var populateProcessArray = function (jsonFileList) {
    jsonFileList.forEach(function (jsonfile) {
        processArray.push({ "ID" : require(jsonfile),  "workDir" : path.dirname(jsonfile)});
    });
}

var _refreshProcess = function (jobObject) {
    if(debugMode)
        console.log("Storing job " + jobObject.id);

    var newJobRepr = {
        "ID" : jobObject.getSerialIdentity(),
        "workDir" :  jobObject.workDir
    };


    processArray.push(newJobRepr);
    accessorArray.forEach(function(pAccessor) {
        if ( _isConstraintsOk(newJobRepr, pAccessor.constraints) ) {
             if(debugMode) {
                console.log("Adding above job to folowing accessor");
                console.dir(pAccessor.constraints);
            }
            pAccessor.results.push(processArray[processArray.length - 1]);
        }
    });
}

var _index = function (cacheDirList) {
    console.log("indexing following cache folders " + cacheDirList);

    cacheDirList.forEach(function (dir) {
        console.log("dd:" + dir);
        var files = glob.sync(dir + "/**/jobID\.json", {follow : true});
        //var files = find.fileSync(/jobID\.json$/, dir);
        populateProcessArray(files);
    });
    if(debugMode) {
        console.log("###########INDEXED WAREHOUSE CONTENT############");
        console.log("processArray stores " + processArray.length + " elements");
        viewProcessArray();
        console.log("accessorArray stores " + accessorArray.length + " elements");
        viewAccessorArray();
        console.log("\n\n");
    }
}

var viewProcessArray = function (d) {
    var pArray = d ? d : processArray;
    pArray.forEach(function(e, i) {
        console.log("Process Num " + i + "\nlocation: " + e.workDir);
        console.dir(e.ID);
    });
}

var viewAccessorArray = function (d) {
    var aArray = d ? d : accessorArray;

    aArray.forEach(function(e, i) {
        console.log("Accessor Num " + i + ' has ' + e.results + ' elements');
        console.dir(e.constraints);
        viewProcessArray(e.results)
        //console.log("===============");
    });
}


/*
    Iterate over constraints, as soon as a constraints is violated returns false
    Two type of constraints atomic one
                            list

*/
var _isConstraintsOk = function(currentProcess, constraints)  {
    /*if (debugMode) {
        console.log("scanning Following objects");
        console.dir(constraints);
        console.dir(currentProcess);
    }*/
    for (var key in constraints) {
        if (!currentProcess.ID.hasOwnProperty(key)) return false;
        if (constraints[key] === null) continue; // Any value is acceptable
        // IF value were specified we require that at least one  matches
        var target = currentProcess.ID[key] instanceof Array ? currentProcess.ID[key] : [currentProcess.ID[key]];
        var constr = constraints[key] instanceof Array ? constraints[key] : [constraints[key]];
       // console.dir(target);
        var intersect = _intersect(target, constr);
        if (intersect.length === 0) return false;
    }
    return true;
}

var _filter = function (constraints) {

    var results = null;
    for (var pAccessor in accessorArray) {
        if (deepEqual(constraints, pAccessor.constraints)) {
            results = pAccessor.results;
            if (debugMode) console.log("previous similar accession found");
            break;
        }
    }

    if (results == null) {
        results = processArray.filter(function(d){
                return _isConstraintsOk(d, constraints);
        });
        accessorArray.push({ "constraints" : constraints, "results" : results });
    }

    if (debugMode) {
        var tmp = accessorArray[ accessorArray.length - 1 ].results;
        console.log("\t\t::filtering processes => " + tmp.length + " hits");
        console.log("Constraints:");
        console.dir(accessorArray[ accessorArray.length - 1 ].constraints);
        console.log("Processes:");
        viewProcessArray(tmp);
    }

    return results.map(function(d){ return d.workDir; });
}

function _intersect(a, b) {
    /*console.dir(a);
    console.dir(b);*/
    var t;
    if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) {
        return b.indexOf(e) > -1;
    });
}

module.exports = {
        index  : _index,
        store : _refreshProcess,
        getWorkDir : _filter,
        debugOn : function() { debugMode = true; },
        view : function () {
            console.log("\t\t###########CURRENT WAREHOUSE CONTENT############");
            console.log("#processArray stores " + processArray.length + " elements");
            viewProcessArray();
            console.log("#accessorArray stores " + accessorArray.length + " elements");
            viewAccessorArray();
            console.log("\n\n");
        }

};

/*
    data = { rax : [ { id : JSONcontent, path : '/path/to/workDir'}, ... ]
             accessor
        }


*/