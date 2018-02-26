# nSlurm
node wrapper to slurm scheduler
node jobManager_test.js -f ../config/arwenConf.json -e emulator


-------------------------

### JOB OBJECT 
A job is an Object. It contains variables and functions.

#### JOB ID
A job is defined by its input(s) and the `jobID.json` file. The `jobID.json` file is like :
```
{
  'script' : '/path/to/a/777_coreScript.sh',
  'exportVar' : {
    'flags' : ' --option1 --option2 ',
    'moduleScript' : '/path/to/this/script'
  },
  'modules' : ['blast'],
  'tagTask' : 'blast' // 'blast' is just an example. It can be 'clustal', 'naccess', etc.
}
```
where :
- `script` is a path to the `_coreScript.sh` (see the [JOB CACHE CONTENT](#JOB-CACHE-CONTENT) part)
- `exportVar` is a JSON
- `modules` is an array
- `tagTask`




#### JOB VARIABLES (into job.js)
- engineHeader <string> = written into the `.sbatch` file, containing all the variables to parameter the scheduler
- submitBin <string> = path to the binary file of the scheduler, to run the `.sbatch` file
- cmd <string> = command to test the `.sbatch` (like `echo "toto"` for example)
- script <string> = path to the source of the `_coreScript.sh` (to be copied into the cache directory)
- exportVar <JSON> = JSON of variable to export. For example : `{'myVar': 'titi', 'aFile': '/path/'}`
- inputs <JSON> = JSON of the inputs and their name. For example : `{'nameInput1': 'contentInput1', 'nameInput2': 'contentInput2'}`
- tagTask <string> = specific to taskObject
- emulated <boolean> = true if the job is emulated (on your proper computer), false if the job is run with a scheduler
- port <number> = port to communicate via Netcat
- adress <string> = adress of the machine that will run the job (IP adress)
- workDir <string> = directory of the job (see the [JOB CACHE CONTENT](#JOB-CACHE-CONTENT) part)
- namespace <string> = directory of the pipeline of the job
- cwd <> =
- cwdClone <> =
- ttl <> = deprecated ???
- ERR_jokers <number> = counter for jobs emitting an error -> can be re-submitted 2 times more
- MIA_jokers <number> = "Missing In Action" = counter for missing job in queue
- modules <string>[] = array of the module to load into the `_coreScript.sh`
- debugBool <boolean> =
- inputSymbols <> = 

#### JOB FUNCTIONS (into job.js)
- start() =
- getSerialIdentity() = to create the `jobID.json`
- submit() = create a process to execute the `.sbtach`

#### JOB CACHE CONTENT
When a job is created, the JM create a directory where all files related to this job will be written. The minimalist content (where 777 is a uuid) :
- `777_coreScript.sh` <file>
- `777.batch` <file>
- `jobID.json` <file>
- `777.err` <file>
- `777.out` <file>
- `input` <directory>, containing :
  - `myInput1.inp` <file>
  - `myInput2.inp` <file>
Here, the job needs two input files, named `myInput1.inp` and `myInput2.inp`.

>**Note**
>These two names (without the extension) are described as variables into the `777.batch` file, to indicate their paths. Thus, the path to the input files of the job are known in `777.batch`.








