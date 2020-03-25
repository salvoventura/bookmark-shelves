/******************************************************************************
  Author : Salvatore Ventura <salvoventura@gmail.com>
    Date : 17 Mar 2020
 Purpose : Save the entire content of the Bookmark Bar as a Shelf, and allow
           to swap it with others to reduce clutter.
           Use the "Other Bookmarks" folder as storage, nothing funky.

           Compatible with Chrome and Firefox, via webextension-polyfill v.0.4.0
 Version : 1.0

******************************************************************************/
"use strict";
// https://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
// chrome detection from this post triggers true on FF as well, hence using Firefox detection
// Firefox 1.0+
var isFirefox = typeof InstallTrigger !== 'undefined';

/*
 Predefined bookmark folders have different IDs in different browsers.
 Need to set this accordingly

                     Chrome    Firefox
 'Bookmarks Bar':       "1"    "toolbar_____"
 'Other Bookmarks':     "2"    "unfiled_____"
*/
var TOOLBAR_ID = isFirefox ? "toolbar_____" : "1";
var STORAGE_ID = isFirefox ? "unfiled_____" : "2";

/*
 We use SHELVES_ROOT_ID to store all shelves.
 It will sit under STORAGE_ID.
*/
var SHELVES_ROOT_TITLE = "SHELVES_ROOT";
var SHELVES_ROOT_ID = "";
var BOOKMARK_URL = "https://github.com/salvoventura/save-my-tabs";
var IS_FIRST_RUN = true;
var IS_UPDATE;


/*-----------------------------------------------------------------------------
    async function prepareUiShelfSelect(shelfId)

      Populate the addon popup select element with the list of existing shelves.
      User can only switch between shelves, or create new ones.
      New shelf needs a name.
      Upon switch, active shelf is saved.
*/
async function prepareUiShelfSelect(shelfId) {

    // try-catch wrapper to make Chrome happy
    try {
        console.log(`prepareUiShelfSelect`);
        // console.log(`  shelfId = ${shelfId}`);
        // console.log(`  SHELVES_ROOT_ID = ${SHELVES_ROOT_ID}`);
        var activeShelf;

        // Get list of subfolders of the SHELVES_ROOT_ID
        let selectFolder = document.getElementById("shelves-list");
        let children = await browser.bookmarks.getChildren(SHELVES_ROOT_ID);

        if (children.length) {
            IS_FIRST_RUN = false;

            // console.log(`  We found some shelves: let's load them`);
            // Get active shelf first
            activeShelf = await getActiveShelfBookmark();

            // Append values as items to the select element of the popup
            for (let item of children) {
                // console.log(`    ${item.title} ${item.id} ${item.parentId}`);
                if (item.type === "bookmark") {
                    continue;
                }
                let option = new Option(item.title, item.id, false, (activeShelf === item.title));
                selectFolder.appendChild(option);
            }
        } else {
            console.log(`  No shelves yet: first run`);
            IS_FIRST_RUN = true;
        }
        IS_UPDATE = !IS_FIRST_RUN;

        // prepare popup accordingly
        activateSelectOrCreateUI();

    } catch (error) {
        console.error(`An error occurred during prepareUiShelfSelect: ${error.message}`);
    }
}

/*-----------------------------------------------------------------------------
    function activateSelectOrCreateUI

        Update UI based on current state of IS_UPDATE and IS_FIRST_RUN

*/
function activateSelectOrCreateUI() {

    try {
        const btnSave = document.getElementById("btnSave");
        const btnSwap = document.getElementById("btnSwap");
        const shelfNewInput = document.getElementById("shelf-new");
        const shelfSelectInput = document.getElementById("shelf-select");

        if (IS_FIRST_RUN) {
          btnSwap.classList.add('hidden');
        }

        if (IS_UPDATE) {
            // hide create shelf and update button
            if (shelfSelectInput.classList.contains('hidden')) {shelfSelectInput.classList.remove('hidden')};
            shelfNewInput.classList.add('hidden');
            btnSave.innerHTML = 'Update';
            btnSave.disabled = false;

        } else {
            // hide select list and show create shelf and update button
            if (shelfNewInput.classList.contains('hidden')) {shelfNewInput.classList.remove('hidden')};
            shelfSelectInput.classList.add('hidden');
            btnSave.innerHTML = 'Save';
            btnSave.disabled = true;
        }

    } catch (error) {
        console.error(`An error occurred during activateSelectOrCreateUI: ${error.message}`);
    }
}

/*-----------------------------------------------------------------------------
    async function setActiveShelfBookmark(shelfId)

      We need to remember what the current active shelf is.
      We do that by updating a bookmark to the SHELVES_ROOT_ID
      in which:
         title : is the name of the active shelf
           url : this extension GitHub page
*/
async function setActiveShelfBookmark(shelfName) {

    // try-catch wrapper to make Chrome happy
    try {
        console.log(`setActiveShelfBookmark >> ${shelfName}`);
        // console.log(`  shelfName = ${shelfName}`);

        var found = false;
        let children = await browser.bookmarks.getChildren(SHELVES_ROOT_ID);
        if (children.length) {
            for (let item of children) {
                console.log(`    ${item.type} ${item.title} ${item.id} ${item.parentId}`);
                if (item.type === "bookmark" && item.url === BOOKMARK_URL) {
                    // found: let's update it
                    console.log(`    Updating ${item.id} to ${shelfName}`);
                    await browser.bookmarks.update(item.id, {
                        title: shelfName
                    });
                    found = true;
                }
            }
        }
        if (!found) {
            console.log(`    Not found: creating`);
            await browser.bookmarks.create({
                parentId: SHELVES_ROOT_ID,
                title: shelfName,
                url: BOOKMARK_URL
            });
        }

    } catch (error) {
        console.error(`An error occurred during setActiveShelfBookmark: ${error.message}`);
    }
}

/*-----------------------------------------------------------------------------
    async function getActiveShelfBookmark()

      Retrieve name of the current active shelf.

*/
async function getActiveShelfBookmark() {

    // try-catch wrapper to make Chrome happy
    try {
        console.log(`getActiveShelfBookmark`);

        let found = false;
        let children = await browser.bookmarks.getChildren(SHELVES_ROOT_ID);
        if (children.length) {
            for (let item of children) {
                // console.log(`    ${item.title} ${item.id} ${item.parentId}`);
                if (item.type === "bookmark" && item.url === BOOKMARK_URL) {
                    // found:
                    return item.title
                }
            }
        }
        if (!found) {
            // console.log(`    Could not find an active shelf`);
            return
        }

    } catch (error) {
        console.error(`An error occurred during getActiveShelfBookmark: ${error.message}`);
    }
}

/*-----------------------------------------------------------------------------
    async function shelfToTree(shelfId)

      Traverse the given shelfId subtree and return a JSON tree of it.
      Top-most element is skipped: only its children are stored.
      Must use with await, like: tree = await shelfToTree(id);
*/
async function shelfToTree(shelfId) {

    // try-catch wrapper to make Chrome happy
    try {
        console.log(`shelfToTree ${shelfId}`);

        var root = await browser.bookmarks.getSubTree(shelfId);
        var o = recurse(root[0]);
        // console.log(JSON.stringify(o, null, 4))
        return o;

    } catch (error) {
        console.error(`An error occurred during shelfToTree: ${error.message}`);
    }

    function recurse(cur, topmost) {
        var obj = {}
        if (topmost === false) {
            obj = {
                'id': cur.id,
                'title': cur.title,
                'type': cur.type
            };
            if (cur.url) {
                obj['url'] = cur.url;
            }
        }
        if (cur.children) {
            obj['children'] = [];
            for (let child of cur.children) {
                obj['children'].push(recurse(child, false));
            }
        }
        return obj
    }
}


/*-----------------------------------------------------------------------------
    async function findOrCreateSubFolder(folder, parent_id)

      Search for "folder" under parent_id.
      Create it if not found.
      Returns the node.
*/
async function findOrCreateSubFolder(folder, parent_id) {

    // try-catch wrapper to make Chrome happy
    try {
        console.log(`findOrCreateFolder ${folder} ${parent_id}`);
        // console.log(`  ${folder} ${parent_id}`);

        // Look for the WORSKPACES_ROOT folder: return a promise
        // console.log(`  Looking for ${folder}`);

        var searching = browser.bookmarks.search({
            title: folder
        });
        // return a promise
        return searching.then(found_or_creating).then(got_it).catch(error);


    } catch (error) {
        console.error(`An error occurred during findOrCreateFolder: ${error.message}`);
    }

    function found_or_creating(results) {
        if (results.length) {
            // console.log(`  found ${results.length} results`);
            for (let node of results) {
                // console.log(`  Found and checking  ${node.id} ${node.title} ${node.parentId}`);
                if (node.parentId == parent_id) {
                    // console.log(`  Found and returning ${node.id}`);
                    return node; // this will be received by "got_it"
                }
            }
            // console.log(`  Not found here which is weird`);
            throw new Error("We got search results but none matched the parent_id, which is weird.");

        } else {
            console.log(`  Found none, going to create`);
            // return a promise, received by "got_it"
            return browser.bookmarks.create({
                parentId: parent_id,
                title: folder
            });
        }
    }

    function got_it(node) {
        // console.log(`  Got it ${node.id}`);
        // return a value
        return node
    }

    function error() {
        console.log(`Error during search`);
    }
}


/*-----------------------------------------------------------------------------
    async function treeToShelf(tree, shelfId)
    
      Take json tree and recreate its structure under 
      the folder indentified by the shelfId.
      Empty its content first.

*/
async function treeToShelf(tree, shelfId) {

    // try-catch wrapper to make Chrome happy
    try {
        console.log(`treeToShelf ${tree} ${shelfId}`);
        // console.log(`  ${tree} ${shelfId}`);

        var children = await browser.bookmarks.getChildren(shelfId);
        for (let child of children) {
            // console.log(`  deleting ${child.title} ${child.type}`);
            await browser.bookmarks.removeTree(child.id);
        }
        await create_node(tree, shelfId);

    } catch (error) {
        console.error(`An error occurred during treeToShelf: ${error.message}`);
    }

    async function create_node(item, parent_id) {
        // console.log(` processing ${item.title}/${parent_id}`);
        var obj = {}
        var l_parent_id = parent_id;
        var new_node;

        if (item.title) {
            obj = {
                parentId: parent_id,
                title: item.title,
            };
            if (item.url) {
                obj['url'] = item.url;
            }

            new_node = await browser.bookmarks.create(obj);
            // console.log(` got new_node.id = ${new_node.id}`);
            l_parent_id = new_node.id;
        }

        if (item.children && item.children.length) {
            // console.log(` got ${item.children.length} children`);
            let promises = [];
            for (let child of item.children) {
                // console.log(`  + ${child.title} ${child.type}`);
                promises.push(create_node(child, l_parent_id));
            }
            // console.log('  x');
            return await Promise.all(promises);
        }
        return new_node;
    }
}


/*-----------------------------------------------------------------------------
    async function activateShelf(shelf)

      Should be called by virtue of selecting a shelf in the form.
      Sequence of operations should be:
      1. Determine name of active shelf
      2. Load active shelf to tree
      3. Save tree to SHELVES_ROOT_ID under its shelf id
      4. Load selected shelf to tree
      5. Save tree to TOOLBAR_ID

*/
async function activateShelf(shelf) {

    // try-catch wrapper to make Chrome happy
    try {
        console.log(`activateShelf ${shelf.title} ${shelf.id}`);

        var saveto_shelf_name = await getActiveShelfBookmark();
        var saveto_shelf_node = await findOrCreateSubFolder(saveto_shelf_name, SHELVES_ROOT_ID);
        var tree = await shelfToTree(TOOLBAR_ID);
        await treeToShelf(tree, saveto_shelf_node.id);

        tree = await shelfToTree(shelf.id);
        await treeToShelf(tree, TOOLBAR_ID);
        await setActiveShelfBookmark(shelf.title);

    } catch (error) {
        console.error(`An error occurred during activateShelf: ${error.message}`);
    }
}

/*-----------------------------------------------------------------------------
    async function onShelfNameSelect(e)

        Handle shelf selection process, calling activateShelf
        on the selected shelf

*/
async function onShelfNameSelect(e) {

    // try-catch wrapper to make Chrome happy
    try {
        var shelf = {
            id: e.target.value,
            title: e.target.options[e.target.selectedIndex].innerHTML
        };
        console.log(`onShelfNameSelect ${shelf.id} ${shelf.title}`);
        activateShelf(shelf).then(() => {
            window.close()
        });

    } catch (error) {
        console.error(`An error occurred during onShelfNameSelect: ${error.message}`);
    }
}


/*-----------------------------------------------------------------------------
    async function onSaveBtnClick()

        Initiate the save process:
        1. If this is a new shelf, name must not be empty
        2. if necessary, create the shelf folder
        3. load current shelf
        4. empty destination shelf
        5. save active shelf to destination
        6. close the popup window
*/
async function onSaveBtnClick() {

    // try-catch wrapper to make Chrome happy
    try {
        let shelf;
        let shelfName;

        // detect user's desired folder to be used and
        // if necessary, create the bookmark folder
        if (IS_UPDATE) {
           shelfName = await getActiveShelfBookmark();

        } else {
           shelfName = document.getElementById("shelf-name").value.trim();

        }
        /* Find the shelf or create it: if user types in the same name
           as in the select box, it's not going to be a problem.
        */
        shelf = await findOrCreateSubFolder(shelfName, SHELVES_ROOT_ID);

        // Now use this shelfId to copy over all the bookmarks/folders in the active shelf
        // then close the popup window (as completion indicator)
        var tree = await shelfToTree(TOOLBAR_ID);
        await treeToShelf(tree, shelf.id);

        // Save this as new active shelf name
        setActiveShelfBookmark(shelfName).then(() => {
            window.close()
        });

    } catch (error) {
        console.error(`An error occurred during onSaveBtnClick: ${error.message}`);
    }
}


/*-----------------------------------------------------------------------------
    async function onShelfNameInput(e)

        Enable/disable the Save button according to
        the string value in input.
        Assure we only get a non-empty string.

*/
async function onShelfNameInput(e) {

    try {
        // console.log(`onShelfNameInput`);
        var btnSave = document.getElementById("btnSave");
        if (IS_UPDATE) {
            btnSave.disabled = false;
        } else {
            btnSave.disabled = (e.target.value.trim() == '');
        }
    } catch (error) {
        console.error(`An error occurred during onShelfNameInput: ${error.message}`);
    }
}


/*-----------------------------------------------------------------------------
    function for btnSwap.onclick

        Update UI based on current state: IS_UPDATE/not

*/
function onSwapBtnClick() {

    try {
        IS_UPDATE = !IS_UPDATE;
        activateSelectOrCreateUI();

    } catch (error) {
        console.error(`An error occurred during onSwapBtnClick: ${error.message}`);
    }
}


/*-- MAIN ----------------------------------------------------------------------
  -- MAIN ----------------------------------------------------------------------
  -- MAIN ----------------------------------------------------------------------

    async function onShelfNameInput(e)

    Prepare user interface:
    - populate the select box in the popup
    - attach input handler to input box
    - attach click handlers to buttons

*/
findOrCreateSubFolder(SHELVES_ROOT_TITLE, STORAGE_ID).then((node) => {
    return SHELVES_ROOT_ID = node.id;
}).then(prepareUiShelfSelect);
document.getElementById("shelves-list").onchange = onShelfNameSelect;
document.getElementById("shelf-name").oninput = onShelfNameInput;
document.getElementById("btnSave").onclick = onSaveBtnClick;
document.getElementById("btnSwap").onclick = onSwapBtnClick;