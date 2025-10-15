import React, { useState, useCallback, useMemo } from 'react';
import { UploadCloud, Scan, Shield, Loader2, Download, X, AlertTriangle } from 'lucide-react';

// --- Configuration Constants ---
const API_KEY = "AIzaSyCAda92qwtDOCxHgLjglCNVpIaj3Bi56eY"; // <--- PASTE YOUR GEMINI API KEY HERE
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";
const MAX_ATTEMPTS = 3;

// Structured output schema for the AI response
const RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        status: { type: "STRING", description: "Overall validation status: 'VALID' if no high-confidence PII is found, otherwise 'INVALID'." },
        reason: { type: "STRING", description: "A concise reason for the status (e.g., 'Pass: No PII detected' or 'Fail: High confidence PII found')." },
        qualityScore: { type: "INTEGER", description: "Image clarity and quality score, between 50 (poor) and 100 (perfect)." },
        detections: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    type: { type: "STRING", description: "Detection category: 'pii' for personal data (face, plate), or 'object' for general items (car, person)." },
                    label: { type: "STRING", description: "A descriptive label (e.g., 'Face', 'License Plate', 'Ford Bronco')." },
                    confidence: { type: "NUMBER", description: "Detection confidence score (0.5 to 1.0)." }
                },
                propertyOrdering: ["type", "label", "confidence"]
            }
        }
    },
    propertyOrdering: ["status", "reason", "qualityScore", "detections"]
};

// System instruction to guide the model's persona and task
const SYSTEM_INSTRUCTION = `You are an expert Ford Asset Validation AI. Analyze the uploaded image for general objects and personally identifiable information (PII). PII includes faces and license plates. Respond ONLY with a JSON object following the provided schema.
1. Determine the image quality (clarity, lighting, focus) and assign a qualityScore (50-100).
2. List all objects and PII detected with high confidence (over 0.5) in the 'detections' array.
3. If high-confidence PII is found, set the status to 'INVALID'. Otherwise, set the status to 'VALID'.
4. Provide a brief 'reason' for the status.`;


// --- Utility Components (Simplified components using Tailwind) ---

const Button = React.forwardRef(({ className = "", variant = "default", children, ...props }, ref) => {
    const baseClasses = "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background h-10 px-4 py-2";
    let variantClasses;

    switch (variant) {
        case "outline":
            variantClasses = "border border-input bg-card hover:bg-muted/50 hover:text-foreground shadow-sm";
            break;
        case "destructive":
            variantClasses = "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md";
            break;
        case "ghost":
            variantClasses = "hover:bg-accent hover:text-accent-foreground";
            break;
        default: // default/primary
            variantClasses = "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg";
    }

    return (
        <button
            ref={ref}
            className={`${baseClasses} ${variantClasses} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
});

const Card = ({ className = "", children }) => (
    <div className={`bg-card border rounded-xl shadow-[var(--shadow-card)] p-6 ${className}`}>
        {children}
    </div>
);

// --- Component Implementations ---

/**
 * Upload Area Component
 */
const UploadArea = ({ onImageUpload, isProcessing }) => {
    const fileInputRef = React.useRef(null);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isProcessing) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
            onImageUpload(Array.from(e.dataTransfer.files));
        }
    }, [onImageUpload, isProcessing]);

    const handleManualSelect = useCallback((e) => {
        if (e.target.files && e.target.files.length) {
            onImageUpload(Array.from(e.target.files));
        }
    }, [onImageUpload]);

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div 
            className={`
                border-4 border-dashed rounded-2xl p-16 text-center transition-all duration-300 cursor-pointer 
                ${isProcessing ? "border-muted bg-muted/50 opacity-70 pointer-events-none" : "border-primary/50 hover:border-primary hover:bg-primary/10 bg-gradient-subtle"}
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
        >
            <UploadCloud className="w-12 h-12 mx-auto text-primary" />
            <p className="mt-4 text-lg font-semibold text-foreground">Drag and drop images here</p>
            <p className="text-sm text-muted-foreground">or click to browse files (JPG, PNG, WEBP)</p>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleManualSelect} 
                accept="image/*" 
                multiple 
                className="hidden" 
            />
        </div>
    );
};

/**
 * Loading State Component
 */
const ProcessingLoader = () => (
    <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <h2 className="text-2xl font-bold">Analyzing Assets...</h2>
        <p className="text-muted-foreground">This may take a moment while the AI scans for PII, objects, and image quality.</p>
    </div>
);

/**
 * Detection Results Component
 */
const DetectionResults = ({ imageUrl, result, onDownload }) => {
    const { status, reason, qualityScore, detections } = result;

    const isInvalid = status === 'INVALID';
    const statusClasses = isInvalid 
        ? "bg-destructive/10 text-destructive border-destructive/50" 
        : "bg-green-500/10 text-green-700 border-green-500/50";
    const piiDetections = detections.filter(d => d.type === 'pii');
    const objectDetections = detections.filter(d => d.type === 'object');
    
    // Simple mock function to get a color for the detection type
    const getDetectionColor = (type) => type === 'pii' ? 'text-destructive' : 'text-primary';

    return (
        <Card className="grid grid-cols-1 lg:grid-cols-3 gap-8 shadow-elevated">
            {/* Image Preview and Status (Left Column) */}
            <div className="lg:col-span-1 space-y-4">
                <img 
                    src={imageUrl} 
                    alt="Analyzed asset" 
                    className="w-full h-auto max-h-80 object-cover rounded-xl border"
                />
                
                <div className={`p-3 rounded-lg font-semibold border ${statusClasses} flex items-center justify-between`}>
                    <span className="flex items-center gap-2">
                        {isInvalid ? <AlertTriangle className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                        {status}
                    </span>
                    <span className="text-sm font-normal italic">{reason}</span>
                </div>
                
                <div className="flex justify-between items-center pt-2">
                    <p className="text-sm font-medium text-muted-foreground">Quality Score (Clarity)</p>
                    <p className="text-2xl font-extrabold text-primary">{qualityScore}%</p>
                </div>
                
                <Button onClick={onDownload} variant="outline" className="w-full gap-2">
                    <Download className="w-4 h-4" /> Download Report
                </Button>
            </div>

            {/* Detection Details (Right Two Columns) */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* PII Detections */}
                <div className="space-y-3">
                    <h3 className="text-xl font-semibold flex items-center gap-2 text-destructive">
                        <Shield className="w-5 h-5 fill-destructive/20" /> PII Violations ({piiDetections.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {piiDetections.length > 0 ? (
                            piiDetections.map((d, i) => (
                                <div key={i} className="flex flex-col items-center p-3 border rounded-lg bg-destructive/5">
                                    <X className="w-5 h-5 text-destructive" />
                                    <span className="text-sm font-medium text-destructive mt-1">{d.label}</span>
                                    <span className="text-xs text-muted-foreground">({Math.round(d.confidence * 100)}% Conf)</span>
                                </div>
                            ))
                        ) : (
                            <p className="col-span-full text-muted-foreground italic">No personally identifiable information detected.</p>
                        )}
                    </div>
                </div>

                {/* Object Detections */}
                <div className="space-y-3 pt-4 border-t border-border">
                    <h3 className="text-xl font-semibold flex items-center gap-2 text-primary">
                        <Scan className="w-5 h-5 fill-primary/20" /> General Objects ({objectDetections.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {objectDetections.map((d, i) => (
                            <div key={i} className="flex flex-col items-center p-3 border rounded-lg bg-muted/50">
                                <span className={`text-lg font-medium ${getDetectionColor(d.type)}`}>{d.label}</span>
                                <span className="text-xs text-muted-foreground">({Math.round(d.confidence * 100)}% Conf)</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Card>
    );
};


/**
 * Main Application Component
 */
const App = () => {
    // State to hold the uploaded images and their analysis results
    const [images, setImages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Mock Toast function for UI feedback
    const toast = useCallback((data) => {
        // In a real app, this would show a notification bubble.
        console.log(`[TOAST] ${data.title}: ${data.description}`);
    }, []);

    // --- Core API Logic ---
    const analyzeSingleImage = useCallback(async (fileData) => {
        if (!API_KEY) {
            console.error("API Key is missing. Please insert it at the top of src/App.jsx.");
            return { 
                status: 'INVALID', 
                reason: 'API Key missing or invalid.', 
                qualityScore: 50, 
                detections: [] 
            };
        }

        const createInlineData = (base64Data, mimeType) => ({
            inlineData: { mimeType, data: base64Data }
        });

        const payload = {
            contents: [{
                parts: [
                    { text: "Analyze this image and respond ONLY with a JSON object following the system instructions." },
                    createInlineData(fileData.base64, fileData.mimeType)
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA
            },
            systemInstruction: {
                parts: [{ text: SYSTEM_INSTRUCTION }]
            }
        };

        let attempts = 0;
        while (attempts < MAX_ATTEMPTS) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const jsonResponse = await response.json();
                const textContent = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (textContent) {
                    const result = JSON.parse(textContent);
                    // Ensure qualityScore is an integer between 50 and 100
                    result.qualityScore = Math.min(100, Math.max(50, parseInt(result.qualityScore, 10) || 50));
                    return result; 
                } else {
                    throw new Error("Empty or malformed content received from API.");
                }

            } catch (error) {
                attempts++;
                console.warn(`Attempt ${attempts} failed for ${fileData.file.name}:`, error.message);
                
                if (attempts < MAX_ATTEMPTS) {
                    const delay = Math.pow(2, attempts) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`Failed to analyze ${fileData.file.name} after ${MAX_ATTEMPTS} attempts.`);
                    return { status: 'INVALID', reason: 'System error: API failed after multiple retries.', qualityScore: 50, detections: [] };
                }
            }
        }
        return { status: 'INVALID', reason: 'Analysis process failed unexpectedly.', qualityScore: 50, detections: [] };
    }, []);


    // --- File Handling and Batch Processing ---
    const handleImageUpload = useCallback(async (files) => {
        setIsProcessing(true);
        const newImages = files.map(file => ({
            file,
            url: URL.createObjectURL(file),
            status: 'processing',
            result: null
        }));
        setImages(newImages);

        let totalDetections = 0;
        let processedCount = 0;

        // Use a counter to track completion status
        const completeProcessing = () => {
             processedCount++;
             if (processedCount === newImages.length) {
                setIsProcessing(false);
                toast({
                    title: "Batch Analysis Complete",
                    description: `Analyzed ${files.length} image${files.length > 1 ? 's' : ''}. Total detections: ${totalDetections}.`,
                });
             }
        };

        newImages.forEach((imageState, i) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                const base64 = e.target.result.split(',')[1];
                const mimeType = imageState.file.type;
                
                const fileData = { file: imageState.file, base64, mimeType };
                const analysisResult = await analyzeSingleImage(fileData);
                
                const finalImageState = {
                    ...imageState,
                    status: 'done',
                    result: analysisResult,
                };

                totalDetections += analysisResult.detections.length;

                // Update state for the single image
                setImages(prevImages => prevImages.map((img, idx) => 
                    idx === i ? finalImageState : img
                ));
                
                completeProcessing();
            };
            reader.readAsDataURL(imageState.file);
        });
        
    }, [analyzeSingleImage, toast]);

    // --- Action Handlers ---
    const handleDownload = useCallback(() => {
        toast({
            title: "Report Downloaded",
            description: "Detection report has been saved",
        });
    }, [toast]);

    const handleNewScan = useCallback(() => {
        setImages([]);
        setIsProcessing(false);
    }, []);
    
    // SVG Placeholder for Ford Logo
    const fordLogo = useMemo(() => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" className="h-10 w-auto">
            <ellipse cx="50" cy="25" rx="45" ry="22" fill="hsl(195 85% 45%)" stroke="hsl(0 0% 100%)" strokeWidth="2"/>
            <text x="50" y="29" fontFamily="Arial, sans-serif" fontSize="20" fill="hsl(0 0% 100%)" textAnchor="middle" dominantBaseline="middle" style={{fontWeight: 900}}>Ford</text>
        </svg>
    ), []);

    // Check if any image is currently pending/processing
    const isAnyImageProcessing = images.some(img => img.status === 'processing');

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {fordLogo}
                            <div>
                                <h1 className="text-xl font-bold text-foreground">Ford Object & PII Detector</h1>
                                <p className="text-xs text-muted-foreground">
                                    Advanced image analysis & privacy protection
                                </p>
                            </div>
                        </div>
                        {images.length > 0 && (
                            <Button onClick={handleNewScan} variant="outline" className="gap-2" disabled={isAnyImageProcessing}>
                                <Scan className="w-4 h-4" />
                                New Scan
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-12">
                {images.length === 0 ? (
                    <div className="max-w-3xl mx-auto space-y-8">
                        <div className="text-center space-y-4">
                            <h2 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                                Detect Objects & Protect Privacy
                            </h2>
                            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                                Upload assets to automatically scan for objects, measure image quality, and identify sensitive PII (Faces, License Plates).
                            </p>
                        </div>

                        <UploadArea onImageUpload={handleImageUpload} isProcessing={isProcessing} />

                        {/* Features */}
                        <div className="grid md:grid-cols-3 gap-6 pt-8">
                            <Card className="text-center space-y-3">
                                <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
                                    <Scan className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="font-semibold text-foreground">Object Detection</h3>
                                <p className="text-sm text-muted-foreground">
                                    Identify vehicles, people, and environmental objects.
                                </p>
                            </Card>

                            <Card className="text-center space-y-3">
                                <div className="w-12 h-12 rounded-full bg-destructive/10 mx-auto flex items-center justify-center">
                                    <AlertTriangle className="w-6 h-6 text-destructive" />
                                </div>
                                <h3 className="font-semibold text-foreground">PII Detection</h3>
                                <p className="text-sm text-muted-foreground">
                                    Detect faces, license plates, and sensitive information.
                                </p>
                            </Card>

                            <Card className="text-center space-y-3">
                                <div className="w-12 h-12 rounded-full bg-accent/10 mx-auto flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-accent" />
                                </div>
                                <h3 className="font-semibold text-foreground">Quality Scoring</h3>
                                <p className="text-sm text-muted-foreground">
                                    Get a clarity score to ensure asset usability and focus.
                                </p>
                            </Card>
                        </div>
                    </div>
                ) : isProcessing ? (
                    <ProcessingLoader />
                ) : (
                    <div className="space-y-8">
                        {images.map((image, idx) => (
                            image.result && (
                                <DetectionResults
                                    key={idx}
                                    imageUrl={image.url}
                                    result={image.result}
                                    onDownload={handleDownload}
                                />
                            )
                        ))}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="border-t border-border mt-24 py-8 bg-card/30 backdrop-blur-sm">
                <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
                    <p>Object & PII Detector - Protecting your privacy with AI-powered analysis</p>
                </div>
            </footer>
        </div>
    );
};

export default App;
