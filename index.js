function selectText(containerid) {
    if (window.getSelection) { 
        //this does not work with IE. oh well, I removed IE support. If you want to add it back in, go back several commits and you will see IE implementation.
        var range = document.createRange();
        range.selectNode(document.getElementById(containerid));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    }
}
updateWidth = function(){
        newWidth = document.getElementById("bulletInputSize").value + 'mm';
        document.getElementById("bulletInput").style.width = newWidth;        
}

function updateProcessedBullets(){
    var rawBulletStr = document.getElementById("bulletInput").value;
    var rawBullets = rawBulletStr.split('\n');

    updateDict('bulletInput');
    var optimWidth = document.getElementById("bulletInputSize").value + 'mm';

    var bulletObjs = [];
    for(var bulletText of rawBullets){
        bulletText = replaceAbbrs(bulletText);
        bulletObjs.push(new Bullet(bulletText))
    }

    var bulletPromises = [];

    for (var i=0; i<bulletObjs.length;i++){
        //console.log('adding promise')
        var bulletObj = bulletObjs[i];
            
        if(document.getElementById('toggleSpaces').checked == true){
            var alreadyThere = bulletDict[sentence2Key(bulletObj.words.join(' '))].optimizations[optimWidth];
            //console.log(alreadyThere)
            if(alreadyThere && 
                (alreadyThere.status == BULLET.OPTIMIZED || alreadyThere.status == BULLET.FAILED_OPT)){
                //console.log('optimization already exists')
                bulletObj.optimization = alreadyThere;

            }else{
                var bulletPromise = new Promise(function(resolve,reject){
                    bulletObj.optimizeSpacings(optimWidth);
                    bulletDict[sentence2Key(bulletObj.words.join(' '))].optimizations[optimWidth] = bulletObj.optimization;
                    resolve();
                    //console.log(bulletDict[sentence2Key(bulletText)])
                });
                bulletPromises.push(bulletPromise);      
            }
        }else{
            //what to do if space optimization is disabled
            bulletObj.optimization.width = optimWidth;
        }
    }
    
    var outputWrapper = document.getElementById('outputBorder');
    outputWrapper.innerHTML = 'LOADING'; //clear out 
    
    Promise.all(bulletPromises).then(function(e){
        //console.log(bulletPromises)
        outputWrapper.innerHTML = ''; //clear out 
        for (bulletObj of bulletObjs){
            bulletObj.post(outputWrapper)
        }
    });

}

//technically not a cookie, but localStorage now.
function saveCookie(){
    cookieData = encodeURIComponent(
        document.getElementById('bulletInput').value
        );
    //console.log(cookieData);
    //document.cookie = cookieData +  '; expires=Thu, 18 Dec 3000 12:00:00 UTC; path=/';
    try{
        localStorage.setItem('bullets',cookieData)
        console.log("saved bullets to local storage with character length " + cookieData.length);
        localStorage.setItem('abbrs',JSON.stringify(window.abbrTable.getSourceData()));
        console.log("saved abbrs to local storage with num rows " + window.abbrTable.countRows());
    }catch(err){
        if(err.name == 'SecurityError'){
            alert("Sorry, saving to cookies does not work using the file:// interface and your browser's privacy settings")
        }else{
            throw err;
        }
    }
}


function importPdf(){
    if(!document.getElementById("importPdf").value){
        console.log('no file picked');
        return;
    }
    work = getBulletsFromPdf(document.getElementById("importPdf").files[0]);

    work.pullBullets.then(function(bullets){
        //console.log(bullets);
        
        //if I use innerHTML, the textarea doesn't update sometimes.
        // if I set the value to the bullet string, it parses it as HTML and includes things like &amp;
        // so I needed to parse it as actual HTML and get the resulting text.
        document.getElementById("bulletInput").value = 
            new DOMParser().parseFromString(bullets,'text/html').documentElement.textContent;
        //console.log(bullets)
        work.getPageInfo.then(function(data){
            console.log(data)
            document.getElementById("bulletInputSize").value = data.width.replace(/mm/,'');
            document.getElementById("bulletInputSize").oninput();
            
        });
    });
}

function getSampleAbbrs(callback){
    //for some reason, Promises did not work. Will utilize function callback instead
    var xhttp = new XMLHttpRequest();

    xhttp.responseType = 'blob';
    xhttp.onload = function(){
        callback(this.response)
    }
    xhttp.open('GET','./abbrs.xlsx',true);
    xhttp.send();
    
}

function importAbbrs(){

        if(!document.getElementById("importAbbrs").value){
            console.log('no file picked');
            return;
        }
        var abbrFile = document.querySelector('#importAbbrs').files[0]
        return abbrFile;
    
}

function getDataFromXLS(file){
    var reader = new FileReader();
    reader.onload = function(event){
        var data = event.target.result;
        var workbook = XLSX.read(data,{
            type:'binary',
            raw:true,
        });
        var rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],
            {'header':['enabled','value','abbr']});
        window.abbrTable.updateSettings({data:[]});
        window.abbrTable.loadData(rows);
        
    };
    reader.readAsBinaryString(file)
}
function writeAbbrTableToXLS(){
    var wb = XLSX.utils.book_new();
    var sht  = XLSX.utils.aoa_to_sheet(abbrTable.getData());
    XLSX.utils.book_append_sheet(wb,sht,'abbrs')
    XLSX.writeFile(wb,'abbrs.xlsx');
}
function addWordWithAbbrs(word, topNode){
    var fullWordNode = document.createElement('span');
    var abbrNode = document.createElement('span');
    fullWordNode.innerText = word;
    if(window.abbrDict[word]){
        abbrNode.style.fontWeight = 'bold';
        abbrNode.innerText = ' (' + window.abbrDict[word] + ')';
    }else if(window.abbrDictDisabled[word]){
        fullWordNode.style.fontWeight = 'bold';
        abbrNode.innerText += ' (' + window.abbrDictDisabled[word] + ')'
    }
    topNode.appendChild(fullWordNode);
    topNode.appendChild(abbrNode);
}
function getThesaurus(){
    
    var sel = window.getSelection();
    
    //console.log(sel)
    if(sel.type != 'None' && (sel.anchorNode.id == 'bulletsBorder' || sel.anchorNode.parentNode.className == 'bullets')){
        
        var selString = sel.toString();
        
        //this stupid stuff is to fix MS Edge, because sel.toString doesn't work right for textareas.
        if(selString == '' && sel.anchorNode.nodeName != '#text'){
            var textAreaNode = sel.anchorNode.querySelector('textarea');
            selString = textAreaNode.value.substring(textAreaNode.selectionStart, textAreaNode.selectionEnd)
            //console.log('edge fix:' + selString)
        }
        //console.log('selected string: ' + selString)
        // limit phrase sent to API to 8 words. Should work fine if phrase is less than 8 words
        var maxWords = 8;
        var phrase = selString.trim().split(/\s+/).slice(0,maxWords).join(' ');
        
        if(phrase){
            console.log('valid selection: ' + phrase);
            var xhttp = new XMLHttpRequest();
            xhttp.onreadystatechange = function () {
                if(this.readyState == 4 && this.status == 200){
                    var dat = JSON.parse(this.responseText);
                    //console.log(dat);

                    document.querySelector('#thesaurus').innerHTML = ''
                    var phraseNode = document.createElement('div');
                    addWordWithAbbrs(phrase, phraseNode)
                    document.querySelector('#thesaurus').appendChild(phraseNode);
                    var list = document.createElement('ul');
                    document.querySelector('#thesaurus').appendChild(list);
                    // add original word thesarus display
                    
                    for (var i of dat){
                        var wordNode = document.createElement("li");
                        addWordWithAbbrs(i.word, wordNode)
                        list.appendChild(wordNode);
                    }

                    if(dat.length == 0){
                        document.querySelector('#thesaurus').innerText =  'no results found.'
                    }
                    
                }
            }

            xhttp.open("GET","https://api.datamuse.com/words?max=75&ml=" + phrase,true)

            xhttp.send();
            //loading text will be replaced when xhttp request is fulfilled
            document.querySelector('#thesaurus').innerText = 'loading...';
            


        }
    }
   
}
function autoResizeTextArea(id){
    ta = document.getElementById(id);
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    //ta.style.width = 'auto';
    //ta.style.width = ta.scrollWidth + 'px';
}
window.onload = function(e){
    //This function runs when the window is finished loading. sort of like a main()

    //initialize a default width for the textarea window
    //document.getElementById("bulletInputSize").value = 202.321;
    document.getElementById("bulletInputSize").value = 202.51;
    document.getElementById("bulletInput").value = 'Input Bullets Here';

    window.bulletDict = {};
    window.abbrDictDisabled = {};
    window.abbrDict = {};

    window.prevUpdate = (new Date()).getTime();
    
    // implementing fontReady as a promise (instead of using document.fonts.ready) to make it Edge compatible
    var fontReady = new Promise(function(resolve,rej){
        WebFont.load({
            custom: {
              families: ['AdobeTimes']
            }
        });
        resolve();
    });

    //since the spacing is heavily font-dependent, the custom font needs to be loaded before spacing optimization is executed.
    fontReady.then(function(){
        console.log('font loaded')
        autoResizeTextArea('bulletInput');
    }).then(function(){
        window.abbrTable = initTables([]);
        var tableUpdater = function(){
            updateAbbrDict();
            updateProcessedBullets();
            getThesaurus();
            //console.log('change occurred')
        };
        window.abbrTable.addHook('afterChange',tableUpdater);
        window.abbrTable.addHook('afterPaste',tableUpdater);
        window.abbrTable.addHook('afterRemoveRow',tableUpdater);
        getSavedData();
        setEventListeners();
        autoResizeTextArea('bulletInput');
    });
    


}

function getSavedData(){
    try{
        if(localStorage.getItem('bullets')){
            var text = decodeURIComponent(localStorage.getItem("bullets")).trim();
            if(text){
                document.getElementById("bulletInput").value = text;
            }
            var abbrs = JSON.parse(localStorage.getItem('abbrs'));
            if(abbrs){
                window.abbrTable.updateSettings({data:[]});
                window.abbrTable.loadData(abbrs);
            }
            
        }
    }catch(err){
        if(err.name == 'SecurityError'){
            console.log('Was not able to get localstorage bullets due to use of file interface and browser privacy settings');
            getSampleAbbrs().then(function(file){
                getDataFromXLS(file)
            });
        }else{
            throw err;
        }
    }
}
function setEventListeners(){
    document.getElementById("bulletInputSize").oninput = function(){
        updateProcessedBullets();
        autoResizeTextArea('bulletInput');
    }

    document.getElementById("bulletInput").oninput = function(){
        
       updateProcessedBullets();
            
       autoResizeTextArea('bulletInput');
       //saveCookie();
    };
    document.getElementById("cookieButton").onclick = saveCookie;
    document.getElementById("outputBorder").onclick = function(e){
        if(e.detail === 4){
            selectText("outputBorder");
        }
    }
    document.getElementById("outputBorder").onkeydown = function(e){
        if(e.ctrlKey && e.keyCode == 65){
        e.preventDefault();
        //console.log('control-a')
        selectText('outputBorder')
        }
    }
    document.getElementById('resetButton').onclick = function(){
        normalizeWhiteSpace("bulletInput");
    }
    document.getElementById('importPdf').onchange = importPdf;
    
    document.querySelector("#bulletInput").onmouseup = getThesaurus;
    document.querySelector("#bulletInput").onkeyup = getThesaurus;
    document.querySelector("#outputBorder").onmouseup = getThesaurus;
    document.querySelector("#outputBorder").onkeyup = getThesaurus;

    document.querySelector('#awdButton').onclick = function(){
        document.querySelector('#bulletInputSize').value = Forms.all['AF1206']['likelyWidth'].replace(/mm/,'');
        document.querySelector('#bulletInputSize').oninput();
    }
    document.querySelector('#eprButton').onclick = function(){
        document.querySelector('#bulletInputSize').value = Forms.all['AF910']['likelyWidth'].replace(/mm/,'');
        document.querySelector('#bulletInputSize').oninput();
    }
    document.querySelector('#oprButton').onclick = function(){
        document.querySelector('#bulletInputSize').value = Forms.all['AF707']['likelyWidth'].replace(/mm/,'');
        document.querySelector('#bulletInputSize').oninput();
    }

    document.querySelector('#importAbbrs').onchange = function(){
        getDataFromXLS(importAbbrs());
        document.querySelector('#importAbbrs').value = '';
    };
    document.getElementById('toggleSpaces').onchange = function(){
        //console.log('check');
        updateProcessedBullets()
    };

    document.getElementById('outputBorder').oncopy = function(e){
        temp = e;
        var text = Bullet.Untweak(window.getSelection().toString())
        //console.log('Copy event: ' + text)
        text = text.replace(/\n/g,'\r\n'); //need this for WINDOWS!
        //console.log('Copy event: ' + text)
        e.clipboardData.setData('text/plain',text);
        e.preventDefault();
    }

    document.getElementById('sampleAbbrs').onclick = function(){
        if(confirm("Are you sure you want to remove all existing acronyms and replace with a sample list?")){
            getSampleAbbrs(function(file){
                getDataFromXLS(file)
            });
        }
    }
};