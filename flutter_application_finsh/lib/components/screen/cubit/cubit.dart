import 'package:flutter_application_finsh/components/screen/cubit/states.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class login_screenCubit extends Cubit<login_screenSate>
{
  login_screenCubit():super(login_screenInitialState());

  static login_screenCubit get(context)=> BlocProvider.of(context);

  void userLogin()
  {
    
  }

}