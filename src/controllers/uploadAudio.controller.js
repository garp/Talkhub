// controllers/uploadAudio.controller.js
const multer = require('multer');
const { upload } = require('../../lib/middlewares/audioUpload.middleware');

const uploadAudio = (req, res) => {
  const runUpload = upload.single('audio');

  runUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message,
        details: 'Make sure you are using the field name "audio" for your audio file upload',
      });
    }
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file uploaded.' });
    }

    const {
      location, key, bucket, etag, mimetype, size,
    } = req.file;

    console.log('Audio uploaded successfully.', {
      location,
      key,
      bucket,
      etag,
      mimetype,
      size,
    });

    return res.status(201).json({
      message: 'Audio uploaded successfully',
      file: location,
      mediaType: 'audio',
      contentType: mimetype,
      originalName: req.file.originalname,
      size,
      folder: 'audios',
    });
  });
};

module.exports = { uploadAudio };
