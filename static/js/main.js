// Initialize history arrays for undo/redo functionality
let undoStack = [];
let redoStack = [];
let isUndoRedoAction = false;

function setup() {
    canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    canvas.parent("#canvasArea");

    socket = io.connect(window.location.href);
    socket.on("mouse", newDrawing);

    socket.on("clear", () => {
        background(BACKGROUND_COLOR);
    });

    socket.on("undo", () => {
        isUndoRedoAction = true;
        performUndo();
        isUndoRedoAction = false;
    });

    socket.on("redo", () => {
        isUndoRedoAction = true;
        performRedo();
        isUndoRedoAction = false;
    });

    $("#clearScreen").click(clearScreen);
    $("#brush").click(activateBrush);
    $("#eraser").click(activateEraser);
    $("#downloadImage").click(saveMyCanvas);
    $("#undo").click(undoAction);
    $("#redo").click(redoAction);

    // activate the brush mode
    activateBrush();
    
    // Save initial canvas state
    saveCanvasState();
}

function drawOnCanvas(e) {
    const brushWidth = document.querySelector("#brushWidthRange").value;
    let color = null;

    if (e.srcElement.parentElement && (e.srcElement.parentElement.id === "canvasArea" && modes.brush)) {
        color = hexColor;
        stroke(hexColor);
        strokeWeight(brushWidth);
        line(mouseX, mouseY, pmouseX, pmouseY);
    } else if (e.srcElement.parentElement && (e.srcElement.parentElement.id === "canvasArea" && modes.eraser)) {
        color = BACKGROUND_COLOR;
        stroke(BACKGROUND_COLOR);
        strokeWeight(brushWidth);
        line(mouseX, mouseY, pmouseX, pmouseY);
    }

    let data = {
        x: mouseX,
        y: mouseY,
        px: pmouseX,
        py: pmouseY,
        weight: brushWidth,
        color,
    };
    socket.emit("mouse", data);
}

function mouseDragged(e) {
    drawOnCanvas(e);
}

function mouseReleased() {
    // Save canvas state after drawing is complete
    saveCanvasState();
}

function mouseClicked(e) {
    drawOnCanvas(e);
    // Save canvas state after a single click drawing
    saveCanvasState();
}

function clearScreen() {
    background(BACKGROUND_COLOR);
    socket.emit("clear");
}

function activateBrush() {
    modes.brush = true;
    modes.eraser = false;

    $("#brush").addClass("active");
    $("#eraser").removeClass("active");
}

function activateEraser() {
    modes.brush = false;
    modes.eraser = true;

    $("#brush").removeClass("active");
    $("#eraser").addClass("active");
}

function newDrawing(data) {
    stroke(data.color);
    strokeWeight(data.weight);
    line(data.x, data.y, data.px, data.py);
}

function saveMyCanvas() {
    saveCanvas(canvas, "myCanvas", "png");
}

// Save current canvas state to the undo stack
function saveCanvasState() {
    // Get the current canvas data
    let canvasData = canvas.elt.toDataURL();
    
    // Add to undo stack
    undoStack.push(canvasData);
    
    // Clear redo stack when new drawing occurs
    if (!isUndoRedoAction) {
        redoStack = [];
    }
    
    // Limit stack size to prevent memory issues
    if (undoStack.length > 20) {
        undoStack.shift();
    }
}

// Apply a canvas state from data URL
function applyCanvasState(dataURL) {
    if (!dataURL) {
        console.error('Invalid canvas state data URL');
        return;
    }
    
    return new Promise((resolve, reject) => {
        let img = new Image();
        
        img.onerror = function() {
            console.error('Failed to load canvas state image');
            background(BACKGROUND_COLOR);
            reject(new Error('Failed to load canvas state image'));
        };
        
        img.onload = function() {
            background(BACKGROUND_COLOR);
            if (img.width > 0 && img.height > 0) {
                image(img, 0, 0);
                resolve();
            } else {
                console.warn('Loaded image has invalid dimensions');
                reject(new Error('Invalid image dimensions'));
            }
        };
        
        img.src = dataURL;
    });
}

async function performUndo() {
    if (undoStack.length <= 1) return; // Keep at least the initial state
    
    try {
        // Move current state to redo stack
        let currentState = undoStack.pop();
        redoStack.push(currentState);
        
        // Apply the previous state
        await applyCanvasState(undoStack[undoStack.length - 1]);
    } catch (error) {
        console.error('Error during undo:', error);
        // Restore the stack if operation fails
        if (redoStack.length > 0) {
            undoStack.push(redoStack.pop());
        }
    }
}

async function performRedo() {
    if (redoStack.length === 0) return;
    
    try {
        // Get the state to redo
        let stateToRedo = redoStack.pop();
        
        // Apply the state before adding to undo stack to prevent duplicates
        await applyCanvasState(stateToRedo);
        
        // Add it back to the undo stack only after successful application
        undoStack.push(stateToRedo);
    } catch (error) {
        console.error('Error during redo:', error);
        // Restore the redo stack if operation fails
        if (undoStack.length > 0) {
            redoStack.push(undoStack.pop());
        }
    }
}

// Handle undo action and emit to other clients
function undoAction() {
    performUndo();
    socket.emit('undo');
}

// Handle redo action and emit to other clients
function redoAction() {
    performRedo();
    socket.emit('redo');
}
