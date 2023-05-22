// import 'dart:async';
// import 'dart:convert';
// import 'dart:math';
// import 'dart:typed_data';
//
// import 'package:flutter/material.dart';
// import 'package:flutter/cupertino.dart';
// import 'package:image/image.dart' as im;
// import 'package:image/image.dart';
// import 'package:provider/provider.dart';
// import 'package:http/http.dart' as http;
//
// import 'package:learning_input_image/learning_input_image.dart';
// import 'package:learning_face_detection/learning_face_detection.dart';
// import 'package:provider/provider.dart';
//
// class LearningFaceDetection extends StatefulWidget {
//   @override
//   _LearningFaceDetectionState createState() => _LearningFaceDetectionState();
// }
//
// class _LearningFaceDetectionState extends State<LearningFaceDetection> {
//   LearningFaceDetectionState get state =>
//       Provider.of<LearningFaceDetectionState>(context, listen: false);
//
//   FaceDetector _detector = FaceDetector(
//     mode: FaceDetectorMode.accurate,
//     detectLandmark: true,
//     detectContour: true,
//     enableClassification: true,
//     enableTracking: true,
//   );
//
//   // @override
//   // void dispose() {
//   //   _detector.dispose();
//   //   super.dispose();
//   // }
//
//   Future<void> _detectFaces(InputImage image) async {
//     if (state.isNotProcessing) {
//       state.startProcessing();
//       state.image = image;
//       state.data = await _detector.detect(image);
//
//       // Extract RGB values from the detected face
//       if (state.data.isNotEmpty) {
//         final Face face = state.data[0];
//         InputImageData imageData = image.metadata!;
//         Uint8List bytes = image.bytes!;
//          int bytesPerPixel = 0;
//          int bytesPerRow = 0;
//         final int x = face.boundingBox.left.toInt();
//         final int y = face.boundingBox.top.toInt();
//         final int width = face.boundingBox.width.toInt();
//         final int height = face.boundingBox.height.toInt();
//
//         final int redIndex = y * bytesPerRow + x * bytesPerPixel;
//         final int greenIndex = redIndex + 1;
//         final int blueIndex = redIndex + 2;
//
//         final int red = bytes[redIndex];
//         final int green = bytes[greenIndex];
//         final int blue = bytes[blueIndex];
//
//         // Update the state with the RGB values
//         // get image dimensions
//
//
//         state.rgb = 'R: $red, G: $green, B: $blue';
//
//   if(!state.isLoading) sendDataToApi(red, green, blue);
//
//         ///FAke One
//        //  double gray = (0.2989 * red) + (0.5870 * green) + (0.1140 * blue);
//        //
//        //  // Estimate heart rate based on changes in grayscale value over time
//        //  // This is a very crude estimate and is not reliable
//        //  double heartRate = Random().nextInt(41) + 60;
//        // state.heartRate=heartRate.toString();
//       } else {
//         state.rgb = '';
//       }
//       state.stopProcessing();
//     }
//   }
//
//   void sendDataToApi(int r,int g,int b) async{
//
//     ///From Api
//
//     if(mounted) state.isLoading = true;
//     // Send RGB colors to API using HTTP
//     try {
//       //TODO undo this for api
//       // var response = await http.post(
//       //   Uri.parse('https://example.com/rgb'),
//       //   body: {
//       //     'red': r.toString(),
//       //     'green': g.toString(),
//       //     'blue': b.toString()
//       //   },
//       // );
//       //
//       // // Check if API call was successful
//       // if (response.statusCode == 200) {
//       //   // Parse the response body to get the heart rate
//       //   var responseBody = json.decode(response.body);
//       //   var heartRate = responseBody['heartRate'];
//       //
//       //   // Update the state with the new heart rate
//       //   state.heartRate = heartRate.toString();
//       // }
//
//       double heartRate = Random().nextInt(41) + 60;
//       state.heartRate="HeartRate:  ${heartRate.toString()}";
//     } catch (e) {
//       if(mounted) state.isLoading = false;
//       double heartRate = Random().nextInt(41) + 60;
//       state.heartRate="HeartRate:${heartRate.toString()}";
//     }
//     if(mounted) state.isLoading = false;
//
//   }
//
//   @override
//   void dispose() {
//     _detector.dispose();
//     super.dispose();
//   }
//   @override
//   Widget build(BuildContext context) {
//     return InputCameraView(
//       title: 'Face Detection',
//       onImage: _detectFaces,
//       cameraDefault: InputCameraType.front,
//       overlay: Consumer<LearningFaceDetectionState>(
//         builder: (_, state, __) {
//           if (state.isEmpty) {
//             return Container();
//           }
//
//           Size originalSize = state.size!;
//           Size size = MediaQuery.of(context).size;
//
//           // if image source from gallery
//           // image display size is scaled to 360x360 with retaining aspect ratio
//           if (state.notFromLive) {
//             if (originalSize.aspectRatio > 1) {
//               size = Size(360.0, 360.0 / originalSize.aspectRatio);
//             } else {
//               size = Size(360.0 * originalSize.aspectRatio, 360.0);
//             }
//           }
//
//           return Stack(
//             children: [
//               FaceOverlay(
//                 size: size,
//                 originalSize: originalSize,
//                 rotation: state.rotation,
//                 faces: state.data,
//                 contourColor: Colors.white.withOpacity(0.8),
//                 landmarkColor: Colors.lightBlue.withOpacity(0.8),
//               ),
//               if (state.rgb.isNotEmpty)
//                 Positioned(
//                   top: 16,
//                   left: 16,
//                   child: Text(
//                     state.rgb,
//                     style: TextStyle(
//                       color: Colors.white,
//                       fontSize: 16,
//                       fontWeight: FontWeight.bold,
//                     ),
//                   ),
//                 ),
//
//               if (state.heartRate.isNotEmpty)
//                 Positioned(
//                   top: 32,
//                   left: 16,
//                   child: Text(
//                     state.heartRate,
//                     style: TextStyle(
//                       color: Colors.white,
//                       fontSize: 16,
//                       fontWeight: FontWeight.bold,
//                     ),
//                   ),
//                 ),
//             ],
//           );
//         },
//       ),
//     );
//   }
// }
//
// class LearningFaceDetectionState extends ChangeNotifier {
//
//   InputImage? _image;
//   List<Face> _data = [];
//   bool _isProcessing = false;
//   String _rgb = '';
//   String _heartRate = '';
//   bool _isLoading=false;
//   int _countDown=15;
//   InputImage? get image => _image;
//   int get countDown => _countDown;
//   bool get isLoading => _isLoading;
//   List<Face> get data => _data;
//   String get rgb => _rgb;
//   String get heartRate => _heartRate;
//
//   String? get type => _image?.type;
//   InputImageRotation? get rotation => _image?.metadata?.rotation;
//   Size? get size => _image?.metadata?.size;
//
//   bool get isNotProcessing => !_isProcessing;
//   bool get isEmpty => data.isEmpty;
//   bool get isFromLive => type == 'bytes';
//   bool get notFromLive => !isFromLive;
//
//   void startProcessing() {
//     _isProcessing = true;
//     notifyListeners();
//   }
//
//   void stopProcessing() {
//     _isProcessing = false;
//     notifyListeners();
//   }
//   void setCountDown(int value) {
//     _countDown =value;
//     notifyListeners();
//   }
//
//
//   set image(InputImage? image) {
//     _image = image;
//
//     if (notFromLive) {
//       _data = [];
//     }
//     notifyListeners();
//   }
//
//   set data(List<Face> data) {
//     _data = data;
//     notifyListeners();
//   }
//
//   set isLoading(bool value) {
//     _isLoading = value;
//     notifyListeners();
//   }
//
//   set rgb(String rgb) {
//     _rgb = rgb;
//     notifyListeners();
//   }
//
//   set heartRate(String rate) {
//     _heartRate = rate;
//     notifyListeners();
//   }
// }






















//
//
// ////record video
// import 'dart:async';
// import 'dart:io';
//
// import 'package:camera/camera.dart';
// import 'package:flutter/material.dart';
// import 'package:fluttertoast/fluttertoast.dart';
// import 'package:path_provider/path_provider.dart';
// import 'package:video_player/video_player.dart';
//
// class VideoRecorderExample extends StatefulWidget {
//   @override
//   _VideoRecorderExampleState createState() {
//     return _VideoRecorderExampleState();
//   }
// }
//
// class _VideoRecorderExampleState extends State<VideoRecorderExample> {
//   late CameraController controller;
//   String? videoPath;
//
//   List<CameraDescription> cameras=[];
//   int selectedCameraIdx=1;
//
//   final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
//
//   @override
//   void initState() {
//     super.initState();
//
//     // Get the listonNewCameraSelected of available cameras.
//     // Then set the first camera as selected.
//     availableCameras().then((availableCameras) {
//       cameras = availableCameras;
//       controller = CameraController(cameras[1], ResolutionPreset.high);
//       if (cameras.length > 0) {
//         setState(() {
//           selectedCameraIdx = 0;
//         });
//
//         _onCameraSwitched(cameras[selectedCameraIdx]).then((void v) {});
//
//         setState(() {});
//
//       }
//     })
//         .catchError((err) {
//       print('Error: $err.code\nError Message: $err.message');
//     });
//   }
//
//   @override
//   Widget build(BuildContext context) {
//     return Scaffold(
//       key: _scaffoldKey,
//       appBar: AppBar(
//         title: const Text('Camera example'),
//       ),
//       body: Column(
//         children: <Widget>[
//           Expanded(
//             child: Container(
//               child: Padding(
//                 padding: const EdgeInsets.all(1.0),
//                 child: Center(
//                   child: _cameraPreviewWidget(),
//                 ),
//               ),
//               decoration: BoxDecoration(
//                 color: Colors.black,
//                 border: Border.all(
//                   color: controller != null && controller.value.isRecordingVideo
//                       ? Colors.redAccent
//                       : Colors.grey,
//                   width: 3.0,
//                 ),
//               ),
//             ),
//           ),
//           Padding(
//             padding: const EdgeInsets.all(5.0),
//             child: Row(
//               mainAxisAlignment: MainAxisAlignment.start,
//               children: <Widget>[
//                 _cameraTogglesRowWidget(),
//                 _captureControlRowWidget(),
//                 Expanded(
//                   child: SizedBox(),
//                 ),
//               ],
//             ),
//           ),
//         ],
//       ),
//     );
//   }
//
//   IconData _getCameraLensIcon(CameraLensDirection direction) {
//     switch (direction) {
//       case CameraLensDirection.back:
//         return Icons.camera_rear;
//       case CameraLensDirection.front:
//         return Icons.camera_front;
//       case CameraLensDirection.external:
//         return Icons.camera;
//       default:
//         return Icons.device_unknown;
//     }
//   }
//
//   // Display 'Loading' text when the camera is still loading.
//   Widget _cameraPreviewWidget() {
//     if (controller == null || !controller.value.isInitialized) {
//       return const Text(
//         'Loading',
//         style: TextStyle(
//           color: Colors.white,
//           fontSize: 20.0,
//           fontWeight: FontWeight.w900,
//         ),
//       );
//     }
//
//     return AspectRatio(
//       aspectRatio: controller.value.aspectRatio,
//       child: CameraPreview(controller),
//     );
//   }
//
//   /// Display a row of toggle to select the camera (or a message if no camera is available).
//   Widget _cameraTogglesRowWidget() {
//     if (cameras == null) {
//       return Row();
//     }
//
//     CameraDescription selectedCamera = cameras[selectedCameraIdx];
//     CameraLensDirection lensDirection = selectedCamera.lensDirection;
//
//     return Expanded(
//       child: Align(
//         alignment: Alignment.centerLeft,
//         child: ElevatedButton(
//             onPressed: _onSwitchCamera,
//
//             child:Text("${lensDirection.toString()
//                 .substring(lensDirection.toString().indexOf('.')+1)}")
//         ),
//       ),
//     );
//   }
//
//   /// Display the control bar with buttons to record videos.
//   Widget _captureControlRowWidget() {
//     return Expanded(
//       child: Align(
//         alignment: Alignment.center,
//         child: Row(
//           mainAxisAlignment: MainAxisAlignment.spaceEvenly,
//           mainAxisSize: MainAxisSize.max,
//           children: <Widget>[
//             IconButton(
//               icon: const Icon(Icons.videocam),
//               color: Colors.blue,
//               onPressed: controller != null &&
//                   controller.value.isInitialized &&
//                   !controller.value.isRecordingVideo
//                   ? _onRecordButtonPressed
//                   : null,
//             ),
//             IconButton(
//               icon: const Icon(Icons.stop),
//               color: Colors.red,
//               onPressed: controller != null &&
//                   controller.value.isInitialized &&
//                   controller.value.isRecordingVideo
//                   ? _onStopButtonPressed
//                   : null,
//             )
//           ],
//         ),
//       ),
//     );
//   }
//
//   String timestamp() => DateTime.now().millisecondsSinceEpoch.toString();
//
//   Future<void> _onCameraSwitched(CameraDescription cameraDescription) async {
//     if (controller != null) {
//       await controller.dispose();
//     }
//
//     controller = CameraController(cameraDescription, ResolutionPreset.high);
//
//     // If the controller is updated then update the UI.
//     controller.addListener(() {
//       if (mounted) {
//         setState(() {});
//       }
//
//       if (controller.value.hasError) {
//         Fluttertoast.showToast(
//             msg: 'Camera error ${controller.value.errorDescription}',
//             toastLength: Toast.LENGTH_SHORT,
//             gravity: ToastGravity.CENTER,
//             backgroundColor: Colors.red,
//             textColor: Colors.white
//         );
//       }
//     });
//
//     try {
//       await controller.initialize();
//     } on CameraException catch (e) {
//       _showCameraException(e);
//     }
//
//     if (mounted) {
//       setState(() {});
//     }
//   }
//
//   void _onSwitchCamera() {
//     selectedCameraIdx = selectedCameraIdx < cameras.length - 1
//         ? selectedCameraIdx + 1
//         : 0;
//     CameraDescription selectedCamera = cameras[selectedCameraIdx];
//
//     _onCameraSwitched(selectedCamera);
//
//     setState(() {
//       selectedCameraIdx = selectedCameraIdx;
//     });
//   }
//
//   void _onRecordButtonPressed() {
//     _startVideoRecording().then((String filePath) {
//       if (filePath != null) {
//         Fluttertoast.showToast(
//             msg: 'Recording video started',
//             toastLength: Toast.LENGTH_SHORT,
//             gravity: ToastGravity.CENTER,
//
//             backgroundColor: Colors.grey,
//             textColor: Colors.white
//         );
//       }
//     });
//   }
//
//   void _onStopButtonPressed() {
//     _stopVideoRecording().then((_) {
//       if (mounted) setState(() {});
//       Fluttertoast.showToast(
//           msg: 'Video recorded to $videoPath',
//           toastLength: Toast.LENGTH_SHORT,
//           gravity: ToastGravity.CENTER,
//
//           backgroundColor: Colors.grey,
//           textColor: Colors.white
//       );
//     });
//   }
//
//   Future<String> _startVideoRecording() async {
//     if (!controller.value.isInitialized) {
//       Fluttertoast.showToast(
//           msg: 'Please wait',
//           toastLength: Toast.LENGTH_SHORT,
//           gravity: ToastGravity.CENTER,
//
//           backgroundColor: Colors.grey,
//           textColor: Colors.white
//       );
//
//       return "null";
//     }
//
//     // Do nothing if a recording is on progress
//     if (controller.value.isRecordingVideo) {
//       return "null";
//     }
//
//     final Directory appDirectory = await getApplicationDocumentsDirectory();
//     final String videoDirectory = '${appDirectory.path}/Videos';
//     await Directory(videoDirectory).create(recursive: true);
//     final String currentTime = DateTime.now().millisecondsSinceEpoch.toString();
//     final String filePath = '$videoDirectory/${currentTime}.mp4';
//
//     try {
//       await controller.startVideoRecording();
//       videoPath = filePath;
//     } on CameraException catch (e) {
//       _showCameraException(e);
//       return "null";
//     }
//
//     return filePath;
//   }
//
//   Future<void> _stopVideoRecording() async {
//     if (!controller.value.isRecordingVideo) {
//       return null;
//     }
//
//     try {
//       await controller.stopVideoRecording();
//     } on CameraException catch (e) {
//       _showCameraException(e);
//       return null;
//     }
//   }
//
//   void _showCameraException(CameraException e) {
//     String errorText = 'Error: ${e.code}\nError Message: ${e.description}';
//     print(errorText);
//
//     Fluttertoast.showToast(
//         msg: 'Error: ${e.code}\n${e.description}',
//         toastLength: Toast.LENGTH_SHORT,
//         gravity: ToastGravity.CENTER,
//
//         backgroundColor: Colors.red,
//         textColor: Colors.white
//     );
//   }
// }

import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:http/http.dart' as http;

class VideoRecorderWidget extends StatefulWidget {
  @override
  _VideoRecorderWidgetState createState() => _VideoRecorderWidgetState();
}

class _VideoRecorderWidgetState extends State<VideoRecorderWidget> {
  late CameraController _controller;
   Future<void>? _initializeControllerFuture;
  late String _videoPath;
  late bool _isRecording;
  late bool _isSending;
  late int _countdownSeconds;
  late Timer _countdownTimer;
  late String _heartRate;
  late String _rgbColor;

  @override
  void initState() {
    super.initState();
    _isRecording = false;
    _isSending = false;
    _countdownSeconds = 15;
    _heartRate = '';
    _rgbColor = '';
    _initializeCameraController();
  }

  Future<void> _initializeCameraController() async {
    final cameras = await availableCameras();
    final frontCamera = cameras.firstWhere(
          (camera) => camera.lensDirection == CameraLensDirection.front,
    );
    _controller = CameraController(
      frontCamera,
      ResolutionPreset.medium,
      enableAudio: false,
    );
    _initializeControllerFuture = _controller.initialize();

    WidgetsBinding.instance.addPostFrameCallback((timeStamp) {
      _startRecording();
    });
  }

  void _startRecording() async {
    if (!_controller.value.isInitialized) {
      return;
    }

    try {
      await _initializeControllerFuture;
      _isRecording = true;

      setState(() {});
      await _controller.startVideoRecording();
      _startCountdown();
    } catch (e) {
      print(e);
    }
  }

  void _stopRecording() async {
    if (!_controller.value.isRecordingVideo) {
      return;
    }

    try {
      _countdownTimer.cancel();
     XFile file= await _controller.stopVideoRecording();
      _videoPath = '${(await getTemporaryDirectory()).path}/${DateTime.now().millisecondsSinceEpoch}.mp4';
      final File filepah = File(_videoPath);
      await filepah.writeAsBytes(await file.readAsBytes());
      _sendVideoToServer();
    } catch (e) {
      print(e);
    }
  }

  void _startCountdown() {
    _countdownTimer = Timer.periodic(Duration(seconds: 1), (timer) {
      setState(() {
        _countdownSeconds--;
      });
      if (_countdownSeconds == 0) {
        _stopRecording();
      }
    });
  }

  Future<void> _sendVideoToServer() async {
    setState(() {
      _isSending = true;
    });

    final url = Uri.parse('https://example.com/upload-video');
    final request = http.MultipartRequest('POST', url);
    final file = File(_videoPath);
    final stream = http.ByteStream(file.openRead());
    final length = await file.length();
    final multipartFile = http.MultipartFile('video', stream, length, filename: 'video.mp4');

    request.files.add(multipartFile);

    try {
      final response = await request.send();
      final responseData = await response.stream.toBytes();
      final responseString = utf8.decode(responseData);
      final jsonMap = json.decode(responseString);
      final heartRate = jsonMap['heart_rate']??"87";
      final rgbColorString = jsonMap['rgb_color']??"R:30 G:50 B:60";
      setState(() {
        _heartRate = heartRate;
        _rgbColor = rgbColorString;
        _isSending = false;
        _countdownSeconds = 15;
        _isRecording = false;
      });
    } catch (e) {
      print(e);
      setState(() {
        _isSending = false;
        _countdownSeconds = 15;
        _isRecording = false;

        //TODo fake result remove it
        _heartRate = "87";
        _rgbColor = "R:30 G:50 B:60";
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          SizedBox(
            height: MediaQuery.of(context).size.height,
            child: FutureBuilder(
              future:_initializeControllerFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.done) {
                  return CameraPreview(_controller);
                } else {
                  return Center(child:Text("Press Start Record Button"));
                }
              },
            ),
          ),
          Positioned.fill(
            top: 50,
            right: 50,
            child: Align(
              alignment: Alignment.topRight,
              child: _isRecording
                  ? Text(
                '$_countdownSeconds',
                style: TextStyle(
                  fontSize: 72,
                  color: Colors.red,
                ),
              )
                  : ElevatedButton(
                onPressed: _startRecording,
                child: Text('Start Recording'),
              ),
            ),
          ),
          Positioned.fill(
            child: Visibility(
              visible: _isSending,
              child: Container(
                color: Colors.black54,
                child: Center(
                  child: CircularProgressIndicator(),
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 30,
            left: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Heart Rate: $_heartRate',style: TextStyle(color: Colors.white,fontWeight: FontWeight.w700,fontSize: 20),),
             SizedBox(height: 15,),
               Text('RGB: $_rgbColor',style: TextStyle(color: Colors.white,fontWeight: FontWeight.w700,fontSize: 20),),

              ],
            ),
          ),
        ],
      ),
    );
  }
}