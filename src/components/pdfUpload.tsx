"use client";

import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useDropzone } from "react-dropzone";
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { PDFDocument, rgb } from 'pdf-lib';

export default function PDFUploader() {
    const [file, setFile] = useState<File | null>(null);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [annotations, setAnnotations] = useState<{ x: number; y: number; width: number; height: number; type: string; page: number }[]>([]);
    const [lines, setLines] = useState<{ points: number[] }[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSigning, setIsSigning] = useState(false);
    const pageRef = useRef<HTMLDivElement | null>(null);
    const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const documentRef = useRef<any>(null);

    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
    ).toString();

    const onDrop = (acceptedFiles: File[]) => {
        const uploadedFile = acceptedFiles[0];
        if (uploadedFile.type === "application/pdf") {
            setFile(uploadedFile);
        } else {
            alert("Please upload a valid PDF file.");
        }
    };

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: { "application/pdf": [".pdf"] },
    });

    function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
        setTotalPages(numPages);
    }

    useEffect(() => {
        const canvas = signatureCanvasRef.current;
        const page = pageRef.current;
        if (!canvas || !page) return;

        const resizeCanvas = () => {
            canvas.width = page.clientWidth;
            canvas.height = page.clientHeight;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [file, pageNumber]);

    const startDrawing = (e: React.MouseEvent) => {
        if (!isSigning || !pageRef.current || !signatureCanvasRef.current) return;
        
        const canvas = signatureCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Configure drawing style
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const rect = pageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsDrawing(true);
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        setLines(prev => [...prev, { points: [x, y] }]);
    };

    const draw = (e: React.MouseEvent) => {
        if (!isDrawing || !isSigning || !pageRef.current || !signatureCanvasRef.current) return;
        
        const canvas = signatureCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = pageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
        
        setLines(prev => {
            const newLines = [...prev];
            const lastLine = newLines[newLines.length - 1];
            lastLine.points = [...lastLine.points, x, y];
            return newLines;
        });
    };

    const stopDrawing = () => {
        if (!signatureCanvasRef.current) return;
        
        const ctx = signatureCanvasRef.current.getContext('2d');
        if (ctx) {
            ctx.closePath();
        }
        setIsDrawing(false);
    };

    const clearSignature = () => {
        if (!signatureCanvasRef.current) return;
        
        const ctx = signatureCanvasRef.current.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
        setLines([]);
    };

    const handleTextSelection = (type: string) => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            if (pageRef.current) {
                const pageRect = pageRef.current.getBoundingClientRect();
                const x = rect.left - pageRect.left;
                const y = rect.top - pageRect.top + (type === "underline" ? rect.height * 0.2 : 0);
                setAnnotations(prev => [...prev, { x, y, width: rect.width, height: rect.height, type, page: pageNumber }]);
            }
            selection.removeAllRanges();
        }
    };

    const handleExport = async () => {
        if (!file || !signatureCanvasRef.current) return;

        try {
            const pdfBytes = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(pdfBytes);

            // Handle annotations
            annotations.forEach(annotation => {
                const page = pdfDoc.getPages()[annotation.page - 1];
                const { width, height } = page.getSize();
                
                const annot = {
                    rect: {
                        x: annotation.x,
                        y: height - (annotation.y + annotation.height),
                        width: annotation.width,
                        height: annotation.height,
                    },
                    color: annotation.type === 'highlight' 
                        ? rgb(1, 1, 0) 
                        : rgb(0, 0, 1)
                };

                switch(annotation.type) {
                    case 'highlight':
                        page.drawRectangle({
                            x: annot.rect.x,
                            y: annot.rect.y,
                            width: annot.rect.width,
                            height: annot.rect.height,
                            color: annot.color,
                            opacity: 0.5
                        });
                        break;
                    case 'underline':
                        page.drawLine({
                            start: { 
                                x: annot.rect.x, 
                                y: annot.rect.y 
                            },
                            end: { 
                                x: annot.rect.x + annot.rect.width, 
                                y: annot.rect.y 
                            },
                            thickness: 2,
                            color: annot.color
                        });
                        break;
                }
            });

            // Handle signature lines
            const canvas = signatureCanvasRef.current;
            const page = pdfDoc.getPages()[pageNumber - 1];
            const { width, height } = page.getSize();

            if (lines.length > 0) {
                lines.forEach(line => {
                    for (let i = 0; i < line.points.length - 2; i += 2) {
                        page.drawLine({
                            start: { 
                                x: line.points[i], 
                                y: height - line.points[i + 1]
                            },
                            end: { 
                                x: line.points[i + 2], 
                                y: height - line.points[i + 3]
                            },
                            thickness: 2,
                            color: rgb(0, 0, 0)
                        });
                    }
                });
            }

            const modifiedPdfBytes = await pdfDoc.save();
            const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'annotated-document.pdf';
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error exporting PDF:", error);
            alert("An error occurred while exporting the PDF.");
        }
    };

    return (
        <div className="p-6 relative">
            {!file ? (
                <div
                    {...getRootProps()}
                    className="border-dashed border-2 border-gray-300 p-10 text-center cursor-pointer"
                >
                    <input {...getInputProps()} />
                    <p>Drag & drop a PDF file here, or click to select one</p>
                </div>
            ) : (
                <div className="border p-4 relative">
                    <div 
                        ref={pageRef} 
                        className="relative" 
                        style={{ position: "relative" }}
                    >
                        <Document 
                            ref={documentRef}
                            file={file} 
                            onLoadSuccess={onDocumentLoadSuccess}
                        >
                            <Page 
                                pageNumber={pageNumber} 
                                width={pageRef.current?.clientWidth}
                            />
                        </Document>
                        
                        {/* Signature Canvas */}
                        <canvas
                            ref={signatureCanvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseOut={stopDrawing}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                zIndex: 50, // Ensure it's above PDF content
                                pointerEvents: isSigning ? 'auto' : 'none',
                                backgroundColor: isSigning ? 'rgba(0,0,0,0.1)' : 'transparent'
                            }}
                        />

                        {/* Annotations */}
                        {annotations.filter(a => a.page === pageNumber).map((annotation, index) => (
                            <div
                                key={index}
                                className={
                                    annotation.type === "highlight"
                                        ? "bg-yellow-300 opacity-50 absolute"
                                        : "border-b-4 border-blue-500 absolute"
                                }
                                style={{
                                    left: annotation.x,
                                    top: annotation.y,
                                    width: annotation.width,
                                    height: annotation.height,
                                }}
                            />
                        ))}
                    </div>
                    
                    <div className="flex justify-between mt-4">
                        <button onClick={() => setPageNumber(prev => Math.max(1, prev - 1))} className="px-4 py-2 bg-gray-200 rounded">
                            Previous
                        </button>
                        <p>Page {pageNumber} of {totalPages}</p>
                        <button onClick={() => setPageNumber(prev => Math.min(totalPages, prev + 1))} className="px-4 py-2 bg-gray-200 rounded">
                            Next
                        </button>
                    </div>
                    
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => handleTextSelection("highlight")} className="px-4 py-2 bg-yellow-300 rounded">Highlight</button>
                        <button onClick={() => handleTextSelection("underline")} className="px-4 py-2 bg-blue-300 rounded">Underline</button>
                        <button onClick={() => setIsSigning(!isSigning)} className="px-4 py-2 bg-green-300 rounded">
                            {isSigning ? "Stop Signing" : "Sign"}
                        </button>
                        <button onClick={clearSignature} className="px-4 py-2 bg-red-300 rounded">
                            Clear Signature
                        </button>
                        <button onClick={handleExport} className="px-4 py-2 bg-red-400 rounded">Export PDF</button>
                    </div>
                </div>
            )}
        </div>
    );
}