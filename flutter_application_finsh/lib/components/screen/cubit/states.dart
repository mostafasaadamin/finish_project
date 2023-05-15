abstract class login_screenSate {}

class login_screenInitialState extends login_screenSate{}

class login_screenLoadingState extends login_screenSate{}

class login_screenSucessState extends login_screenSate{}

class login_screenErrorState extends login_screenSate{
  final String error;
  login_screenErrorState(this.error);
}



