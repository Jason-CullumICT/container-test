# Image Upload Support

## Original Request

Add image upload support to feature requests and bug reports. Users should be able to attach images (mockups, screenshots, specs) when creating features or bugs via a file input on the forms. Images are stored on the backend (use multer for file handling, save to Source/Backend/uploads/). When a feature is submitted to the orchestrator for development, attached images are included in the POST /api/orchestrator/api/work call as multipart form-data. Update FeatureRequestForm and BugForm components with drag-and-drop or click-to-upload image fields. Show image thumbnails on detail views.
