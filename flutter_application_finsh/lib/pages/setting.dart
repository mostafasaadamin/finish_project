import 'package:flutter/material.dart';

class newSetting extends StatefulWidget {
  @override
  _newSetting createState() => _newSetting();
}

class _newSetting extends State<newSetting> {
  bool _darkMode = false;
  bool _notifications = true;
  bool _locationEnabled = false;
  int _fontSize = 16;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Setting'
          ),
      ),
      body: SingleChildScrollView(
        child: Container(
          padding: EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Appearance',
                style: TextStyle(
                  fontSize: 20.0,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 16.0),
              Row(
                children: [
                  Icon(Icons.brightness_4),
                  SizedBox(width: 16.0),
                  Text('Dark mode'),
                  Spacer(),
                  Switch(
                    value: _darkMode,
                    onChanged: (value) {
                      setState(() {
                        _darkMode = value;
                      });
                    },
                  ),
                ],
              ),
              SizedBox(height: 16.0),
              Text(
                'Notifications',
                style: TextStyle(
                  fontSize: 20.0,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 16.0),
              Row(
                children: [
                  Icon(Icons.notifications),
                  SizedBox(width: 16.0),
                  Text('Notifications'),
                  Spacer(),
                  Switch(
                    value: _notifications,
                    onChanged: (value) {
                      setState(() {
                        _notifications = value;
                      });
                    },
                  ),
                ],
              ),
              SizedBox(height: 16.0),
              Text(
                'Location',
                style: TextStyle(
                  fontSize: 20.0,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 16.0),
              Row(
                children: [
                  Icon(Icons.location_on),
                  SizedBox(width: 16.0),
                  Text('Location'),
                  Spacer(),
                  Switch(
                    value: _locationEnabled,
                    onChanged: (value) {
                      setState(() {
                        _locationEnabled = value;
                      });
                    },
                  ),
                ],
              ),
              SizedBox(height: 16.0),
              Text(
                'Text size',
                style: TextStyle(
                  fontSize: 20.0,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 16.0),
              Row(
                children: [
                  Icon(Icons.text_fields),
                  SizedBox(width: 16.0),
                  Text('Font size'),
                  Spacer(),
                  DropdownButton<int>(
                    value: _fontSize,
                    onChanged: (value) {
                      setState(() {
                        _fontSize = value!;
                      });
                    },
                    items: [
                      DropdownMenuItem<int>(
                        value: 16,
                        child: Text('Small'),
                      ),
                      DropdownMenuItem<int>(
                        value: 20,
                        child: Text('Medium'),
                      ),
                      DropdownMenuItem<int>(
                        value: 24,
                        child: Text('Large'),
                      ),
                    ],
                  ),
                ],
              ),      
            ],
          ),
        ),
      ),
    );
  }
}
